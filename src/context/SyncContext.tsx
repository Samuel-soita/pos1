import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { db, type Business } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { POSReducer } from '../lib/reducer';
import { useAuth } from '../hooks/useAuth';
import { generateTraceableId } from '../utils/idUtils';

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  syncError: string | null;
  syncHealth: number;
  syncAll: () => Promise<void>;
  rebuildState: () => Promise<void>;
  activeTerminals: number;
}

const SyncContext = createContext<SyncContextType | null>(null);

// BroadcastChannel for instant cross-tab communication
const broadcast = new BroadcastChannel('pos_sync_channel');

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const needsSyncRef = useRef(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncHealth] = useState<number>(100);
  const [activeTerminals, setActiveTerminals] = useState(1);
  const { businessId, staffId, userType } = useAuth();
  
  const channelRef = useRef<RealtimeChannel | null>(null);

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

  // Handle Broadcast Messages (Instant Local Sync)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'LOCAL_CHANGE_DETECTED') {
        console.log('[Sync] Local change detected in another tab. Triggering sync...');
        syncAll();
      }
    };
    broadcast.addEventListener('message', handleMessage);
    return () => broadcast.removeEventListener('message', handleMessage);
  }, []);

  const pushLocalChanges = useCallback(async () => {
    if (!businessId) return;

    const allPendingEvents = await db.pos_events
      .where('sync_status')
      .equals('pending')
      .toArray();
    
    if (allPendingEvents.length === 0) return;

    allPendingEvents.sort((a, b) => a.client_timestamp - b.client_timestamp);
    
    const batchSize = 100;
    for (let i = 0; i < allPendingEvents.length; i += batchSize) {
      const pendingBatch = allPendingEvents.slice(i, i + batchSize);

      try {
        const payloadBatch = pendingBatch.map(evt => ({
          event_id: evt.event_id,
          business_id: businessId,
          staff_id: evt.staff_id || 'UNKNOWN',
          event_type: evt.event_type,
          payload: evt.payload,
          client_timestamp: evt.client_timestamp,
          hash: evt.hash
        }));

        const { error } = await supabase
          .from('pos_events')
          .upsert(payloadBatch, { ignoreDuplicates: true, onConflict: 'event_id' });

        const isConflict = error && (error as any).code === '23505';

        if (error) {
          if (isConflict) {
            console.warn('Sync conflict detected (record exists), marking as synced locally.');
          } else {
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

        const eventIds = pendingBatch.map(e => e.event_id);
        await db.pos_events.where('event_id').anyOf(eventIds).modify({ sync_status: 'synced' });

      } catch (err: any) {
        console.error('Event Push failure:', err);
        setSyncError(err.message || String(err));
        continue; 
      }
    }
  }, [businessId]);

  const pullRemoteChanges = useCallback(async () => {
    if (!businessId) return;

    try {
      const bizId = businessId;
      const setting = await db.settings.get('last_synced');
      const lastSynced = (setting?.value as number) || 0;

      const fetchBatch = async (afterTimestamp: number) => {
        const { data, error } = await supabase
          .from('pos_events')
          .select('event_id, business_id, staff_id, event_type, payload, client_timestamp, server_timestamp, hash')
          .eq('business_id', bizId)
          .gt('server_timestamp', afterTimestamp)
          .order('server_timestamp', { ascending: true })
          .limit(1000);
        
        if (error) throw error;
        return (data || []).filter(e => e.business_id === bizId);
      };

      let currentCursor = lastSynced;
      let hasMore = true;
      let allIncoming: any[] = [];

      while (hasMore) {
        const batch = await fetchBatch(currentCursor);
        if (batch.length === 0) {
          hasMore = false;
        } else {
          const incomingIds = batch.map(e => e.event_id);
          const existingEvents = await db.pos_events.where('event_id').anyOf(incomingIds).toArray();
          const existingIdsMap = new Map(existingEvents.map(e => [e.event_id, e]));
          
          for (const incoming of batch) {
            const local = existingIdsMap.get(incoming.event_id);
            if (local && local.sync_status === 'pending') {
              await db.pos_events.update(incoming.event_id, {
                sync_status: 'synced',
                server_timestamp: incoming.server_timestamp
              });
            }
          }
          
          const genuinelyNewEvents = batch.filter(e => !existingIdsMap.has(e.event_id));
          allIncoming = [...allIncoming, ...genuinelyNewEvents];
          
          currentCursor = batch[batch.length - 1].server_timestamp;
          if (batch.length < 1000) hasMore = false;
        }
      }

      if (allIncoming.length > 0) {
        const mappedEvents = allIncoming.map(p => ({
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

        await db.transaction('rw', [
          db.pos_events, db.products, db.sales, db.expenses, 
          db.shifts, db.cash_logs, db.staff, db.branches, 
          db.recurring_expenses, db.snapshots, db.settings,
          db.inventory_ledger, db.businesses, db.suppliers, db.purchases
        ], async () => {
          await db.pos_events.bulkPut(mappedEvents);

          for (const evt of mappedEvents) {
            const payload = evt.payload;
            
            switch (evt.event_type) {
              case 'STOCK_RESERVED':
              case 'stock_committed':
              case 'INVENTORY_RESTOCKED': {
                const productId = payload.productId || payload.id;
                const delta = payload.delta || payload.quantity || 0;
                const product = await db.products.get(productId);
                if (product) {
                  await db.products.update(productId, {
                    quantity: Math.round((product.quantity + delta) * 100) / 100,
                    updatedAt: Date.now()
                  });
                } else {
                  await db.products.add({
                    id: productId,
                    businessId: evt.business_id,
                    name: 'Pending Sync...',
                    price: 0,
                    costPrice: 0,
                    quantity: delta,
                    category: 'General',
                    updatedAt: Date.now(),
                    syncStatus: 'synced'
                  });
                }
                
                await db.inventory_ledger.add({
                  id: await generateTraceableId('INV', evt.business_id, 'SYNC', evt.event_id.substring(0, 8)),
                  businessId: evt.business_id,
                  productId,
                  action: delta > 0 ? 'ADD' : 'SALE',
                  quantity: delta,
                  recordedAt: evt.client_timestamp,
                  syncStatus: 'synced'
                });
                break;
              }
               case 'STOCK_RESTORED': {
                const productId = payload.productId || payload.id;
                const delta = payload.delta || 0;
                const product = await db.products.get(productId);
                if (product) {
                  await db.products.update(productId, {
                    quantity: product.quantity + delta,
                    updatedAt: Date.now()
                  });
                  await db.inventory_ledger.add({
                    id: await generateTraceableId('INV', evt.business_id, 'SYNC', evt.event_id.substring(0, 8)),
                    businessId: evt.business_id,
                    productId,
                    action: 'VOID',
                    quantity: delta,
                    recordedAt: evt.client_timestamp,
                    syncStatus: 'synced'
                  });
                }
                break;
              }
              case 'INVENTORY_AUDITED': {
                const productId = payload.productId || payload.id;
                const physicalCount = payload.physicalCount;
                const variance = payload.variance || 0;
                if (productId && physicalCount !== undefined) {
                  await db.products.update(productId, {
                    quantity: physicalCount,
                    updatedAt: Date.now()
                  });
                  await db.inventory_ledger.add({
                    id: await generateTraceableId('INV', evt.business_id, 'SYNC', evt.event_id.substring(0, 8)),
                    businessId: evt.business_id,
                    productId,
                    action: 'AUDIT',
                    quantity: variance,
                    recordedAt: evt.client_timestamp,
                    syncStatus: 'synced'
                  });
                }
                break;
              }
              case 'PRODUCT_CREATED': {
                const existing = await db.products.get(payload.id);
                if (existing) {
                  await db.products.update(payload.id, {
                    ...payload,
                    quantity: existing.quantity,
                    syncStatus: 'synced'
                  });
                } else {
                  await db.products.put({ ...payload, syncStatus: 'synced' });
                }
                if (payload.quantity > 0) {
                  await db.inventory_ledger.add({
                    id: await generateTraceableId('INV', evt.business_id, 'SYNC', evt.event_id.substring(0, 8)),
                    businessId: evt.business_id,
                    productId: payload.id,
                    action: 'ADD',
                    quantity: payload.quantity,
                    recordedAt: evt.client_timestamp,
                    syncStatus: 'synced'
                  });
                }
                break;
              }
              case 'PRODUCT_UPDATED':
                await db.products.update(payload.id, payload);
                break;
              case 'PRODUCT_DELETED':
                await db.products.delete(payload.id);
                break;
               case 'SALE_CREATED':
                await db.sales.put({ ...payload, syncStatus: 'synced' });
                if (payload.items && Array.isArray(payload.items)) {
                  for (const item of payload.items) {
                    await db.inventory_ledger.add({
                      id: await generateTraceableId('INV', evt.business_id, 'SYNC', evt.event_id.substring(0, 8)),
                      businessId: evt.business_id,
                      productId: item.productId,
                      action: 'SALE',
                      quantity: -item.quantity,
                      recordedAt: evt.client_timestamp,
                      syncStatus: 'synced'
                    });
                  }
                }
                break;
               case 'SALE_VOIDED': {
                const { saleId, reason } = payload;
                if (saleId) {
                  await db.sales.update(saleId, { status: 'voided', voidReason: reason });
                }
                break;
              }
              case 'EXPENSE_CREATED':
                await db.expenses.put({ ...payload, syncStatus: 'synced' });
                break;
              case 'EXPENSE_UPDATED':
                await db.expenses.update(payload.id, payload);
                break;
              case 'EXPENSE_DELETED':
                await db.expenses.delete(payload.id);
                break;
              case 'STAFF_CREATED':
              case 'STAFF_UPDATED': {
                const staffData = {
                  ...payload,
                  idNumber: payload.idNumber || payload.id_number,
                  phoneNumber: payload.phoneNumber || payload.phone_number,
                  syncStatus: 'synced'
                };
                delete staffData.id_number;
                delete staffData.phone_number;
                await db.staff.put(staffData);
                break;
              }
              case 'STAFF_DELETED':
                await db.staff.delete(payload.id);
                break;
              case 'BRANCH_CREATED':
              case 'BRANCH_UPDATED':
                await db.branches.put(payload);
                break;
              case 'BRANCH_DELETED':
                await db.branches.delete(payload.id);
                break;
              case 'SUPPLIER_CREATED':
              case 'SUPPLIER_UPDATED': {
                const supplierData = {
                  ...payload,
                  contactPerson: payload.contactPerson || payload.contact_person,
                  kraPin: payload.kraPin || payload.kra_pin
                };
                delete supplierData.contact_person;
                delete supplierData.kra_pin;
                await db.suppliers.put(supplierData);
                break;
              }
              case 'SUPPLIER_DELETED':
                await db.suppliers.delete(payload.id);
                break;
                case 'PURCHASE_CREATED': {
                  await db.purchases.put(payload);
                  for (const item of payload.items) {
                    const product = await db.products.get(item.productId);
                    if (product) {
                      await db.products.update(item.productId, {
                        quantity: Math.round((product.quantity + item.quantity) * 100) / 100,
                        updatedAt: Date.now()
                      });
                    } else {
                      await db.products.add({
                        id: item.productId,
                        businessId: evt.business_id,
                        name: 'Pending Sync...',
                        price: 0,
                        costPrice: item.price || 0,
                        quantity: item.quantity,
                        category: 'General',
                        updatedAt: Date.now(),
                        syncStatus: 'synced'
                      });
                    }
                    await db.inventory_ledger.add({
                      id: await generateTraceableId('INV', evt.business_id, 'SYNC', evt.event_id.substring(0, 8)),
                      businessId: evt.business_id,
                      productId: item.productId,
                      action: 'ADD',
                      quantity: item.quantity,
                      recordedAt: evt.client_timestamp,
                      syncStatus: 'synced',
                      traceId: `SYNC_PURCHASE_${payload.id.substring(0, 8)}`
                    });
                  }
                  break;
                }
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
              case 'RECURRING_EXPENSE_DELETED':
                await db.recurring_expenses.delete(payload.id);
                break;
              case 'BUSINESS_UPDATED': {
                const updatePayload = mapBusinessFromSync(payload);
                await db.businesses.update(payload.id, updatePayload);
                if (payload.name) {
                  await db.settings.put({ key: 'business_name', value: payload.name });
                }
                break;
              }
              case 'SETTING_UPDATED':
                await db.settings.put({ key: payload.key, value: payload.value });
                break;
            }
          }

          let stockSnapshot = await db.snapshots.get(`stock_${bizId}`);
          if (!stockSnapshot) {
            stockSnapshot = await POSReducer.rebuildSnapshot(bizId, 'stock');
          } else {
            mappedEvents.forEach(evt => {
              stockSnapshot = POSReducer.applyEvent(stockSnapshot!, evt);
            });
            await db.snapshots.put(stockSnapshot);
          }

          const maxServerTime = Math.max(...allIncoming.map(e => e.server_timestamp));
          await db.settings.put({ key: 'last_synced', value: maxServerTime });
        });
      }

      const { data: remoteBiz } = await supabase
        .from('businesses')
        .select('package_id, expiry_date, status, staff_count, custom_feature_count, enabled_features, staff_permissions, trial_used, suspended_revenue_count')
        .eq('id', bizId)
        .maybeSingle();

      if (remoteBiz) {
        const updatePayload = mapBusinessFromSync(remoteBiz);
        await db.businesses.update(bizId, updatePayload);
        localStorage.setItem(`entitlement_${bizId}_last_sync`, Date.now().toString());
      }

    } catch (err: any) {
      console.error('Pull failed:', err);
    }
  }, [businessId]);

  const syncAll = useCallback(async () => {
    if (!navigator.onLine || !businessId) return;

    if (isSyncingRef.current) {
      needsSyncRef.current = true;
      return;
    }
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    const performSync = async () => {
      try {
        await pushLocalChanges();
        await pullRemoteChanges();
        
        if (!localStorage.getItem('initial_sync_done')) {
          localStorage.setItem('initial_sync_done', 'true');
        }
      } catch (err: any) {
        setSyncError(err.message || 'Sync failed');
      } finally {
        if (needsSyncRef.current) {
          needsSyncRef.current = false;
          await performSync();
        } else {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }
      }
    };

    await performSync();
  }, [businessId, pushLocalChanges, pullRemoteChanges]);

  const rebuildState = useCallback(async () => {
    if (!businessId) return;

    setIsSyncing(true);
    try {
      await db.transaction('rw', [
        db.products, db.sales, db.expenses, db.shifts, 
        db.cash_logs, db.staff, db.branches, db.recurring_expenses, 
        db.snapshots, db.settings, db.inventory_ledger, db.suppliers, db.purchases,
        db.pos_events
      ], async () => {
        await db.pos_events.where('business_id').equals(businessId).delete();
        await db.products.clear();
        await db.sales.clear();
        await db.expenses.clear();
        await db.shifts.clear();
        await db.cash_logs.clear();
        await db.staff.clear();
        await db.branches.clear();
        await db.recurring_expenses.clear();
        await db.snapshots.clear();
        await db.inventory_ledger.clear();
        await db.suppliers.clear();
        await db.purchases.clear();
        await db.settings.where('key').equals('last_synced').delete();
      });

      localStorage.removeItem('initial_sync_done');
      await syncAll();
    } catch (err) {
      console.error("Reconstruction failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [businessId, syncAll]);

  // Realtime Subscription with Presence
  useEffect(() => {
    if (!businessId || !isOnline) return;

    const channelId = `business_sync_${businessId}`;
    console.log(`[Sync] Initializing Realtime for Business: ${businessId}`);
    
    const channel = supabase.channel(channelId, {
      config: {
        presence: {
          key: staffId || 'owner',
        },
      },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pos_events',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          console.log('[Sync] Remote event detected. Syncing...');
          syncAll();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'businesses',
          filter: `id=eq.${businessId}`
        },
        () => {
          console.log('[Sync] Business record updated. Syncing...');
          syncAll();
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setActiveTerminals(Object.keys(state).length);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('[Sync] New terminal joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('[Sync] Terminal left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Sync] Subscribed to Realtime.');
          await channel.track({
            online_at: new Date().toISOString(),
            user_type: userType,
            device_id: localStorage.getItem('device_id'),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [businessId, isOnline, syncAll, staffId, userType]);

  // Heartbeat & Auto-Push
  useEffect(() => {
    if (!isOnline || !businessId) return;

    const heartbeat = setInterval(() => {
      syncAll();
    }, 30000);

    return () => clearInterval(heartbeat);
  }, [isOnline, businessId, syncAll]);

  const pendingCount = useLiveQuery(() => db.pos_events.where('sync_status').equals('pending').count());
  
  useEffect(() => {
    if (isOnline && pendingCount && pendingCount > 0) {
      // Broadcast to other tabs that we have local changes
      broadcast.postMessage({ type: 'LOCAL_CHANGE_DETECTED' });
      syncAll();
    }
  }, [isOnline, pendingCount, syncAll]);

  function mapBusinessFromSync(remote: Record<string, any>): Partial<Business> {
    const mapped: any = { ...remote };
    if (remote.package_id !== undefined) mapped.packageId = remote.package_id;
    if (remote.expiry_date !== undefined) {
      mapped.expiryDate = typeof remote.expiry_date === 'string' 
        ? new Date(remote.expiry_date).getTime() 
        : remote.expiry_date;
    }
    if (remote.status !== undefined) mapped.status = remote.status;
    if (remote.trial_used !== undefined) mapped.trialUsed = remote.trial_used;
    if (remote.staff_count !== undefined) mapped.staffCount = remote.staff_count;
    if (remote.custom_feature_count !== undefined) mapped.customFeatureCount = remote.custom_feature_count;
    if (remote.enabled_features !== undefined) mapped.enabledFeatures = remote.enabled_features;
    if (remote.staff_permissions !== undefined) mapped.staffPermissions = remote.staff_permissions;
    if (remote.suspended_revenue_count !== undefined) mapped.suspendedRevenueCount = remote.suspended_revenue_count;
    if (remote.mpesa_config !== undefined) mapped.mpesaConfig = remote.mpesa_config;
    
    const snakeKeys = [
      'package_id', 'expiry_date', 'trial_used', 'staff_count', 
      'custom_feature_count', 'enabled_features', 'staff_permissions', 
      'suspended_revenue_count', 'mpesa_config'
    ];
    snakeKeys.forEach(key => delete mapped[key]);
    return mapped;
  }

  return (
    <SyncContext.Provider value={{ 
      isOnline, 
      isSyncing, 
      syncError, 
      syncHealth, 
      syncAll, 
      rebuildState,
      activeTerminals
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
