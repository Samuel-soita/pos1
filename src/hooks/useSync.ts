import { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '../db/db';
import { supabase } from '../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';

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
          const snakeSale = {
            id: item.payload.id,
            business_id: item.payload.businessId,
            receipt_id: item.payload.receiptId,
            total: item.payload.total,
            timestamp: item.payload.timestamp,
            tax_rate: item.payload.taxRate || 0,
            tax_amount: item.payload.taxAmount || 0,
            payment_method: item.payload.paymentMethod || 'Cash',
            device_id: item.payload.deviceId || 'UNKNOWN',
            items: item.payload.items
          };
          const { error } = await supabase.from('sales').insert([snakeSale]);
          if (error) throw error;
        } 
        else if (item.table === 'purchases') {
          // Push Purchase
          const snakePurchase = {
            id: item.payload.id,
            business_id: item.payload.businessId,
            total: item.payload.total,
            timestamp: item.payload.timestamp,
            items: item.payload.items
          };
          const { error } = await supabase.from('purchases').insert([snakePurchase]);
          if (error) throw error;
        } 
        else if (item.table === 'products') {
          const snakeProduct = {
            id: item.payload.id,
            business_id: item.payload.businessId,
            name: item.payload.name,
            price: item.payload.price,
            cost_price: item.payload.costPrice || 0,
            quantity: item.payload.quantity,
            low_stock_threshold: item.payload.lowStockThreshold || 5,
            updated_at: item.payload.updatedAt,
            category: item.payload.category || 'General',
            barcode: item.payload.barcode || ''
          };

          if (item.action === 'INSERT') {
            const { error } = await supabase.from('products').insert([snakeProduct]);
            if (error) throw error;
          } else if (item.action === 'UPDATE') {
            const { error } = await supabase.from('products')
              .update(snakeProduct)
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
        else if (item.table === 'expenses') {
          const snakeExpense = {
            id: item.payload.id,
            business_id: item.payload.businessId,
            title: item.payload.title,
            amount: item.payload.amount,
            category: item.payload.category,
            timestamp: item.payload.timestamp,
            is_recurring: !!item.payload.isRecurring
          };
          const { error } = await supabase.from('expenses').upsert([snakeExpense]);
          if (error) throw error;
        }
        else if (item.table === 'recurring_expenses') {
          const snakeRecurring = {
            id: item.payload.id,
            business_id: item.payload.businessId,
            title: item.payload.title,
            amount: item.payload.amount,
            category: item.payload.category,
            frequency: item.payload.frequency,
            next_run: item.payload.nextRun,
            is_active: item.payload.isActive
          };
          const { error } = await supabase.from('recurring_expenses').upsert([snakeRecurring]);
          if (error) throw error;
        }
        else if (item.table === 'businesses') {
          const snakeBiz = {
            id: item.payload.id,
            name: item.payload.name,
            code: item.payload.code,
            pin: item.payload.pin,
            package_id: item.payload.packageId,
            expiry_date: item.payload.expiryDate,
            status: item.payload.status
          };
          const { error } = await supabase.from('businesses').upsert([snakeBiz]);
          if (error) throw error;
        }
        else if (item.table === 'staff') {
          const snakeStaff = {
            id: item.payload.id,
            business_id: item.payload.businessId,
            code: item.payload.code,
            pin: item.payload.pin,
            first_name: item.payload.firstName,
            last_name: item.payload.lastName,
            phone_number: item.payload.phoneNumber,
            id_number: item.payload.idNumber,
            status: item.payload.status
          };
          const { error } = await supabase.from('staff').upsert([snakeStaff]);
          if (error) throw error;
        }
        else if (item.action === 'VERIFY_PAYMENT') {
          const { error } = await supabase.from('payment_requests').insert([{
            business_id: item.payload.businessId || (await supabase.auth.getSession()).data.session?.user.id,
            mpesa_code: item.payload.mpesaCode,
            payment_type: item.payload.type,
            timestamp: item.timestamp
          }]);
          if (error) throw error;
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
      const bizId = localStorage.getItem('biz_id');
      if (!bizId) return;

      const setting = await db.settings.get('last_synced');
      const lastSynced = (setting?.value as number) || 0;

      // Pull new or updated products
      const { data: updatedProducts, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .gt('updated_at', lastSynced);
      
      if (prodErr) throw prodErr;

      if (updatedProducts && updatedProducts.length > 0) {
        const mappedProducts = updatedProducts.map(p => ({
          id: p.id,
          businessId: p.business_id,
          name: p.name,
          price: p.price,
          costPrice: p.cost_price,
          quantity: p.quantity,
          lowStockThreshold: p.low_stock_threshold,
          updatedAt: p.updated_at,
          category: p.category,
          barcode: p.barcode
        }));
        await db.products.bulkPut(mappedProducts);
      }

      // Pull new sales
      const { data: newSales, error: salesErr } = await supabase
        .from('sales')
        .select('*')
        .gt('timestamp', lastSynced);
        
      if (salesErr) throw salesErr;
      
      if (newSales && newSales.length > 0) {
        const mappedSales = newSales.map(s => ({
          id: s.id,
          businessId: s.business_id,
          receiptId: s.receipt_id,
          total: s.total,
          totalProfit: s.total_profit,
          timestamp: s.timestamp,
          items: s.items,
          taxRate: s.tax_rate,
          taxAmount: s.tax_amount,
          paymentMethod: s.payment_method
        }));
        await db.sales.bulkPut(mappedSales);
      }

      // Pull new expenses
      try {
        const { data: newExpenses, error: expErr } = await supabase
          .from('expenses')
          .select('*')
          .gt('timestamp', lastSynced);
        
        if (expErr) {
          if (expErr.code === 'PGRST205') {
            console.warn('Backend Pull Skip: "expenses" table not found in Supabase.');
          } else {
            throw expErr;
          }
        } else if (newExpenses && newExpenses.length > 0) {
          const mappedExpenses = newExpenses.map(e => ({
            id: e.id,
            businessId: e.business_id,
            title: e.title,
            amount: e.amount,
            category: e.category,
            timestamp: e.timestamp,
            isRecurring: e.is_recurring
          }));
          await db.expenses.bulkPut(mappedExpenses);
        }
      } catch (err) {
        console.warn('Silent Pull Error (expenses):', err);
      }

      // Pull recurring expense templates
      try {
        const { data: recurringData, error: recErr } = await supabase
          .from('recurring_expenses')
          .select('*');
        
        if (recErr) {
          if (recErr.code === 'PGRST205') {
            console.warn('Backend Pull Skip: "recurring_expenses" table not found in Supabase.');
          } else {
            throw recErr;
          }
        } else if (recurringData && recurringData.length > 0) {
          const mappedRecurring = recurringData.map(r => ({
            id: r.id,
            businessId: r.business_id,
            title: r.title,
            amount: r.amount,
            category: r.category,
            frequency: r.frequency,
            nextRun: r.next_run,
            isActive: r.is_active
          }));
          await db.recurring_expenses.bulkPut(mappedRecurring);
        }
      } catch (err) {
        console.warn('Silent Pull Error (recurring_expenses):', err);
      }

      // Pull staff for this business
      const { data: staffData, error: staffErr } = await supabase
        .from('staff')
        .select('*')
        .eq('business_id', bizId);
      
      if (staffErr) throw staffErr;
      if (staffData) {
        const mappedStaff = staffData.map(s => ({
          id: s.id,
          businessId: s.business_id,
          code: s.code,
          pin: s.pin,
          firstName: s.first_name,
          lastName: s.last_name,
          phoneNumber: s.phone_number,
          idNumber: s.id_number,
          status: s.status
        }));
        await db.staff.bulkPut(mappedStaff);
      }

      // Update sync timestamp using server time (prevents local clock tampering sync issues)
      const { data: serverTimeData, error: timeErr } = await supabase.rpc('get_server_timestamp');
      if (timeErr) throw timeErr;
      
      const serverTime = serverTimeData as number;
      await db.settings.put({ key: 'last_synced', value: serverTime });

      if (bizId) {
        const { data: businessData, error: bizErr } = await supabase
          .from('businesses')
          .select('expiry_date, status, package_id')
          .eq('id', bizId)
          .maybeSingle();
          
        if (bizErr) throw bizErr;

        if (businessData) {
          await db.settings.put({ key: 'expiry_date', value: businessData.expiry_date });
          await db.settings.put({ key: 'is_deposit_paid', value: businessData.status === 'active' });
          await db.businesses.update(bizId, { 
             expiryDate: businessData.expiry_date, 
             status: businessData.status,
             packageId: businessData.package_id
          });
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

  // Periodic background sync (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isOnline) {
        syncAll();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isOnline, syncAll]);

  // Immediate push when sync_queue items are added
  const pendingCount = useLiveQuery(() => db.sync_queue.count()) || 0;
  const prevPendingCount = useRef(pendingCount);

  useEffect(() => {
    if (pendingCount > prevPendingCount.current) {
      // Something was added, try to push immediately
      if (isOnline && !isSyncing) {
        syncAll();
      }
    }
    prevPendingCount.current = pendingCount;
  }, [pendingCount, isOnline, isSyncing, syncAll]);

  // Special "Activation" check (High frequency pull when potentially recently paid)
  useEffect(() => {
    const checkPayment = async () => {
      const isDepositPaid = (await db.settings.get('is_deposit_paid'))?.value === true;
      const expiryDate = (await db.settings.get('expiry_date'))?.value as number;
      const soonToExpire = expiryDate - Date.now() < 24 * 60 * 60 * 1000;
      
      if ((!isDepositPaid || soonToExpire) && isOnline && !isSyncing) {
        // Pull updates every minute if we are awaiting activation or about to expire
        const interval = setInterval(() => syncAll(), 60000);
        return () => clearInterval(interval);
      }
    };
    checkPayment();
  }, [isOnline, isSyncing, syncAll]);

  return {
    isOnline,
    isSyncing,
    syncError,
    syncAll
  };
}

export function useSyncStatus() {
  const pendingCount = useLiveQuery(() => db.sync_queue.count()) || 0;
  const { isOnline, isSyncing } = useSync();
  return { pendingCount, isOnline, isSyncing };
}
