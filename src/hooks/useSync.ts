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

        // Handle 409 Conflict: Sync actually succeeded (record already exists on server)
        const isConflict = error && (error as { code: string }).code === '23505'; // Postgres Unique Violation

        if (error) {
          if (isConflict) {
            // Treat conflict as success since the data is already on the server
            console.warn('Sync conflict detected (record exists), marking as synced locally.');
          } else {
            // Real error: Increment retry count
            const eventIds = pendingBatch.map(e => e.event_id);
            for (const id of eventIds) {
               const evt = await db.pos_events.get(id);
               const newRetryCount = (evt?.retry_count || 0) + 1;
               
               if (newRetryCount >= 5) {
                  await db.pos_events.update(id, { 
                    sync_status: 'rejected_dlq', 
                    retry_count: newRetryCount,
                    last_error: error.message 
                  });
               } else {
                  await db.pos_events.update(id, { 
                    retry_count: newRetryCount, 
                    last_error: error.message 
                  });
               }
            }
            throw error;
          }
        }

        // ACKNOWLEDGED (or already exists). Mark them synced locally.
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
        .select('event_id, business_id, staff_id, event_type, payload, client_timestamp, server_timestamp, hash')
        .eq('business_id', bizId)
        .gt('server_timestamp', lastSynced)
        .order('server_timestamp', { ascending: true })
        .limit(1000); // Batched fetch to prevent memory freeze
      
      if (!fetchErr && incomingEvents && incomingEvents.length > 0) {
        // Transform incoming events to local format
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

        // Universal Materializer: Reconstruct all entities in a single atomic transaction
        await db.transaction('rw', [
          db.pos_events, db.products, db.sales, db.expenses, 
          db.shifts, db.cash_logs, db.staff, db.branches, 
          db.recurring_expenses, db.snapshots, db.settings
        ], async () => {
          // 1. Commit the events to the local immutable ledger
          await db.pos_events.bulkPut(mappedEvents);

          // 2. Materialize state from events
          for (const evt of mappedEvents) {
            const payload = evt.payload;
            
            switch (evt.event_type) {
              // --- Inventory & Products ---
              case 'stock_reserved':
              case 'stock_committed':
              case 'INVENTORY_RESTOCKED': {
                const productId = payload.productId || payload.id;
                const delta = payload.delta || payload.quantity || 0;
                const product = await db.products.get(productId);
                if (product) {
                  await db.products.update(productId, {
                    quantity: product.quantity + delta,
                    updatedAt: Date.now()
                  });
                }
                break;
              }
              case 'PRODUCT_CREATED':
                await db.products.put({ ...payload, syncStatus: 'synced' });
                break;
              case 'PRODUCT_UPDATED':
                await db.products.update(payload.id, payload);
                break;
              case 'PRODUCT_DELETED':
                await db.products.delete(payload.id);
                break;

              // --- Financial Entities ---
              case 'sale_created':
                await db.sales.put({ ...payload, syncStatus: 'synced' });
                break;
              case 'EXPENSE_CREATED':
                await db.expenses.put({ ...payload, syncStatus: 'synced' });
                break;
              case 'EXPENSE_UPDATED':
                await db.expenses.update(payload.id, payload);
                break;
              case 'EXPENSE_DELETED':
                await db.expenses.delete(payload.id);
                break;

              // --- Personnel & Logistics ---
              case 'STAFF_CREATED':
                await db.staff.put(payload);
                break;
              case 'STAFF_DELETED':
                await db.staff.delete(payload.id);
                break;
              case 'BRANCH_CREATED':
                await db.branches.put(payload);
                break;
              case 'BRANCH_DELETED':
                await db.branches.delete(payload.id);
                break;

              // --- Control Systems ---
              case 'SHIFT_STARTED':
              case 'SHIFT_UPDATED':
              case 'SHIFT_ENDED':
                await db.shifts.put(payload);
                break;
              case 'CASH_REGISTER_OPENED':
              case 'CASH_REGISTER_CLOSED':
                await db.cash_logs.put(payload);
                break;
              case 'RECURRING_EXPENSE_CREATED':
              case 'RECURRING_EXPENSE_UPDATED':
                await db.recurring_expenses.put(payload);
                break;
              case 'BUSINESS_UPDATED':
                await db.businesses.update(payload.id, payload);
                if (payload.name) {
                  await db.settings.put({ key: 'business_name', value: payload.name });
                }
                break;
              case 'SETTING_UPDATED':
                await db.settings.put({ key: payload.key, value: payload.value });
                break;
            }
          }

          // 3. Update Snapshots
          let stockSnapshot = await db.snapshots.get(`stock_${bizId}`);
          if (!stockSnapshot) {
            stockSnapshot = await POSReducer.rebuildSnapshot(bizId, 'stock');
          } else {
            mappedEvents.forEach(evt => {
              stockSnapshot = POSReducer.applyEvent(stockSnapshot!, evt);
            });
            await db.snapshots.put(stockSnapshot);
          }

          // 4. Update sync cursor
          const maxServerTime = Math.max(...incomingEvents.map(e => e.server_timestamp));
          await db.settings.put({ key: 'last_synced', value: maxServerTime });
        });
      }

      // Phase 4 Hardening: Auto-Unlock Feature
      // Silently refresh the business status from the cloud to detect manual engineer unlocks
      const { data: remoteBiz } = await supabase
        .from('businesses')
        .select('package_id, expiry_date, status, staff_count, custom_feature_count, enabled_features, trial_used, suspended_revenue_count')
        .eq('id', bizId)
        .maybeSingle();

      if (remoteBiz) {
        await db.businesses.update(bizId, {
          packageId: remoteBiz.package_id,
          expiryDate: remoteBiz.expiry_date,
          status: remoteBiz.status,
          staffCount: remoteBiz.staff_count,
          customFeatureCount: remoteBiz.custom_feature_count,
          enabledFeatures: remoteBiz.enabled_features,
          trialUsed: remoteBiz.trial_used,
          suspendedRevenueCount: remoteBiz.suspended_revenue_count
        });
        
        // Update server time reference for drift protection
        localStorage.setItem(`entitlement_${bizId}_last_sync`, Date.now().toString());
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
