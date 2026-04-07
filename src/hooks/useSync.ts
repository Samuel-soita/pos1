import { useState, useCallback, useEffect } from 'react';
import { db } from '../db/db';
import { supabase } from '../lib/supabase';

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
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
    // 1. Get all pending sync actions
    const pendingItems = await db.sync_queue
      .filter(item => item.status !== 'failed')
      .toArray();
    pendingItems.sort((a, b) => a.timestamp - b.timestamp);
    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      try {
        if (item.table === 'sales') {
          // Push Sale to Supabase
          const { error } = await supabase.from('sales').insert([item.payload]);
          if (error) throw error;
        } 
        else if (item.table === 'purchases') {
          // Push Purchase
          const { error } = await supabase.from('purchases').insert([item.payload]);
          if (error) throw error;
        } 
        else if (item.table === 'products') {
          if (item.action === 'INSERT') {
            const { error } = await supabase.from('products').insert([item.payload]);
            if (error) throw error;
          } else if (item.action === 'UPDATE') {
            const { error } = await supabase.from('products')
              .update(item.payload)
              .eq('id', item.payload.id);
            if (error) throw error;
          } else if (item.action === 'STOCK_DELTA') {
            // Use Supabase RPC to prevent race conditions across multiple devices
            const { error } = await supabase.rpc('apply_stock_delta', {
              p_product_id: item.payload.id,
              p_business_id: item.payload.businessId,
              p_quantity_change: item.payload.delta
            });
            if (error) throw error;
          }
        }
        
        // Remove from local queue on explicit success
        await db.sync_queue.delete(item.id);
      } catch (err: unknown) {
        console.error('Failed to sync item:', item, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        const newErrorCount = (item.errorCount || 0) + 1;
        await db.sync_queue.update(item.id, {
          errorCount: newErrorCount,
          lastError: errorMessage,
          status: newErrorCount >= 3 ? 'failed' : 'pending'
        });
        
        setSyncError(errorMessage);
        // Continue to next item so the queue doesn't fully halt
        continue; 
      }
    }
  };

  const pullRemoteChanges = async () => {
    try {
      const setting = await db.settings.get('last_synced');
      const lastSynced = (setting?.value as number) || 0;

      // Pull new or updated products
      const { data: updatedProducts, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .gt('updated_at', lastSynced);
      
      if (prodErr) throw prodErr;

      if (updatedProducts && updatedProducts.length > 0) {
        await db.products.bulkPut(updatedProducts);
      }

      // Pull new sales
      const { data: newSales, error: salesErr } = await supabase
        .from('sales')
        .select('*')
        .gt('timestamp', lastSynced);
        
      if (salesErr) throw salesErr;
      
      if (newSales && newSales.length > 0) {
        await db.sales.bulkPut(newSales);
      }

      // Update sync timestamp using server time (prevents local clock tampering sync issues)
      const { data: serverTimeData, error: timeErr } = await supabase.rpc('get_server_timestamp');
      if (timeErr) throw timeErr;
      
      const serverTime = serverTimeData as number;
      await db.settings.put({ key: 'last_synced', value: serverTime });

      const { data: authData } = await supabase.auth.getSession();
      if (authData?.session?.user?.id) {
        const { data: businessData, error: bizErr } = await supabase
          .from('businesses')
          .select('expiry_date')
          .eq('id', authData.session.user.id)
          .maybeSingle();
          
        if (bizErr) throw bizErr;

        if (businessData) {
          await db.settings.put({ key: 'expiry_date', value: businessData.expiry_date });
        } else {
          // Lazy initialize business row if it doesn't exist
          const defaultExpiry = Date.now() + 14 * 24 * 60 * 60 * 1000;
          await supabase.from('businesses').insert([{
            id: authData.session.user.id,
            name: 'My Business',
            expiry_date: defaultExpiry,
            status: 'active'
          }]);
          await db.settings.put({ key: 'expiry_date', value: defaultExpiry });
        }
      }

      // Calculate the offset to harden the local subscription checks
      const timeOffset = serverTime - Date.now();
      await db.settings.put({ key: 'time_offset', value: timeOffset });

    } catch (err: unknown) {
      console.error('Failed to pull updates:', err);
      if (err instanceof Error) setSyncError(err.message);
    }
  };

  const syncAll = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    
    setIsSyncing(true);
    setSyncError(null);
    try {
      await pushLocalChanges();
      await pullRemoteChanges();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      syncAll();
    }
  }, [isOnline, syncAll]);

  return {
    isOnline,
    isSyncing,
    syncError,
    syncAll
  };
}
