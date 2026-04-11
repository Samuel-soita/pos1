import { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '../db/db';
import { supabase } from '../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { POSReducer } from '../lib/reducer';

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pushLocalChanges = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // Cannot push without cloud identity

    const allPendingEvents = await db.pos_events
      .where('sync_status')
      .equals('pending')
      .toArray();
    
    if (allPendingEvents.length === 0) return;

    allPendingEvents.sort((a, b) => a.client_timestamp - b.client_timestamp);
    
    const batchSize = 100; // Free-tier optimized batching
    for (let i = 0; i < allPendingEvents.length; i += batchSize) {
      const pendingBatch = allPendingEvents.slice(i, i + batchSize);

      try {
        const payloadBatch = pendingBatch.map(evt => ({
          event_id: evt.event_id,
          business_id: session.user.id,
          staff_id: evt.staff_id || 'UNKNOWN',
          event_type: evt.event_type,
          payload: evt.payload,
          client_timestamp: evt.client_timestamp,
          hash: evt.hash
        }));

        // Phase 3: ACK Sync Protocol. Push the events.
        const { error } = await supabase
          .from('pos_events')
          .upsert(payloadBatch, { ignoreDuplicates: true, onConflict: 'event_id' });

        if (error) throw error;

        // ACKNOWLEDGED. Mark them synced locally.
        const eventIds = pendingBatch.map(e => e.event_id);
        await db.pos_events.where('event_id').anyOf(eventIds).modify({ sync_status: 'synced' });

      } catch (err: unknown) {
        console.error('Event Push failure:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setSyncError(errorMessage);
        continue; 
      }
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  };

  const pullRemoteChanges = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const bizId = session.user.id;
      const setting = await db.settings.get('last_synced');
      const lastSynced = (setting?.value as number) || 0;

      // Phase 3: Cursor Pagination Pull (High Performance / Free Tier Safe)
      const { data: incomingEvents, error: fetchErr } = await supabase
        .from('pos_events')
        .select('*')
        .eq('business_id', bizId)
        .gt('server_timestamp', lastSynced)
        .order('server_timestamp', { ascending: true })
        .limit(1000); // Batched fetch to prevent memory freeze
      
      if (!fetchErr && incomingEvents && incomingEvents.length > 0) {
        // Transform and insert to local immutable Dexie ledger
        const mappedEvents = incomingEvents.map(p => ({
            event_id: p.event_id,
            business_id: p.business_id,
            staff_id: p.staff_id,
            event_type: p.event_type,
            payload: p.payload,
            client_timestamp: p.client_timestamp,
            server_timestamp: p.server_timestamp,
            hash: p.hash,
            sync_status: 'synced' as const
        }));

        await db.pos_events.bulkPut(mappedEvents);

        // Send new events through the POSReducer to update React Materialized Snapshots instantly
        // Example: updating Stock Snapshot incrementally based on downloaded events
        let stockSnapshot = await db.snapshots.get(`stock_${bizId}`);
        if (!stockSnapshot) {
             stockSnapshot = await POSReducer.rebuildSnapshot(bizId, 'stock');
        } else {
             incomingEvents.forEach(evt => {
                 stockSnapshot = POSReducer.applyEvent(stockSnapshot!, mappedEvents.find(e => e.event_id === evt.event_id)!);
             });
             await db.snapshots.put(stockSnapshot);
        }

        // Update cursor
        const maxServerTime = Math.max(...incomingEvents.map(e => e.server_timestamp));
        await db.settings.put({ key: 'last_synced', value: maxServerTime });
      }

    } catch (err: unknown) {
      console.error('Pull failed:', err);
    }
  };

  const syncAll = useCallback(async () => {
    if (!navigator.onLine || isSyncingRef.current) return;
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await pushLocalChanges();
      await pullRemoteChanges();
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []); 

  useEffect(() => {
    if (isOnline) syncAll();
  }, [isOnline, syncAll]);

  return {
    isOnline,
    isSyncing,
    syncError,
    syncAll
  };
}

export function useSyncStatus() {
  const pendingCount = useLiveQuery(() => db.pos_events.where('sync_status').equals('pending').count()) || 0;
  const { isOnline, isSyncing } = useSync();
  return { pendingCount, isOnline, isSyncing };
}
