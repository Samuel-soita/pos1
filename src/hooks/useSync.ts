import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { db, type Business } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { POSReducer } from '../lib/reducer';
import { useAuth } from './useAuth';
import { generateTraceableId } from '../utils/idUtils';

// Global subscription manager to prevent duplicate channels across hook instances
const activeChannels = new Map<string, { channel: RealtimeChannel; refCount: number; cleanupTimer?: ReturnType<typeof setTimeout> }>();

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const needsSyncRef = useRef(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncHealth, setSyncHealth] = useState<number>(100);
  const { businessId } = useAuth();

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

  const pushLocalChanges = useCallback(async () => {
    if (!businessId) return; // Cannot push without business identity

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
          business_id: businessId,
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
        
        // Final Defense: Mandatory Local Tenant Isolation Filter
        return (data || []).filter(e => e.business_id === bizId);
      };

      let currentCursor = lastSynced;
      let hasMore = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let allIncoming: any[] = [];

      while (hasMore) {
        const batch = await fetchBatch(currentCursor);
        if (batch.length === 0) {
          hasMore = false;
        } else {
          // Deduplication & Self-Healing:
          // 1. Identify events we already have locally
          const incomingIds = batch.map(e => e.event_id);
          const existingEvents = await db.pos_events.where('event_id').anyOf(incomingIds).toArray();
          const existingIdsMap = new Map(existingEvents.map(e => [e.event_id, e]));
          
          // 2. Transition 'pending' events to 'synced' if they arrived from the server
          const pendingTransitionIds: string[] = [];
          for (const incoming of batch) {
            const local = existingIdsMap.get(incoming.event_id);
            if (local && local.sync_status === 'pending') {
              pendingTransitionIds.push(incoming.event_id);
              // Update local event record with server metadata
              await db.pos_events.update(incoming.event_id, {
                sync_status: 'synced',
                server_timestamp: incoming.server_timestamp
              });
            }
          }
          
          // 3. Only materialize events that are genuinely NEW (not even in our pending state)
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

        // Universal Materializer: Reconstruct all entities in a single atomic transaction
        await db.transaction('rw', [
          db.pos_events, db.products, db.sales, db.expenses, 
          db.shifts, db.cash_logs, db.staff, db.branches, 
          db.recurring_expenses, db.snapshots, db.settings,
          db.inventory_ledger, db.businesses, db.suppliers, db.purchases
        ], async () => {
          // 1. Commit the events to the local immutable ledger
          await db.pos_events.bulkPut(mappedEvents);

          // 2. Materialize state from events
          for (const evt of mappedEvents) {
            const payload = evt.payload;
            
            switch (evt.event_type) {
              // --- Inventory & Products ---
              case 'STOCK_RESERVED':
              case 'stock_committed':
              case 'INVENTORY_RESTOCKED': {
                const productId = payload.productId || payload.id;
                const delta = payload.delta || payload.quantity || 0;
                
                const product = await db.products.get(productId);
                if (product) {
                  // Standard Update
                  await db.products.update(productId, {
                    quantity: Math.round((product.quantity + delta) * 100) / 100,
                    updatedAt: Date.now()
                  });
                } else {
                  // Fault Tolerance: Create a 'Ghost Product' to preserve the stock delta
                  // until the PRODUCT_CREATED event arrives to fill in the metadata.
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
                  console.log(`[ESA] Created Ghost Product for ID: ${productId} to preserve delta: ${delta}`);
                }
                
                // Sync Human-Readable Ledger
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
                  // Sync Human-Readable Ledger
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
                  // Sync Human-Readable Ledger
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
                  // Merge: Keep the existing quantity (which may have been modified by STOCK_RESERVED)
                  // but update the metadata (name, price, etc.)
                  await db.products.update(payload.id, {
                    ...payload,
                    quantity: existing.quantity, // Preserve the delta-materialized quantity
                    syncStatus: 'synced'
                  });
                } else {
                  await db.products.put({ ...payload, syncStatus: 'synced' });
                }

                // Sync Human-Readable Ledger for initial stock
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

              // --- Financial Entities ---
               case 'SALE_CREATED':
                await db.sales.put({ ...payload, syncStatus: 'synced' });
                
                // Sync Human-Readable Ledger for Sale (Redundancy for Deep Repair)
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

              // --- Personnel & Logistics ---
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
                  // Materialize Restocking
                  for (const item of payload.items) {
                    const product = await db.products.get(item.productId);
                    if (product) {
                      await db.products.update(item.productId, {
                        quantity: Math.round((product.quantity + item.quantity) * 100) / 100,
                        updatedAt: Date.now()
                      });
                    } else {
                      // Ghost Product support for purchases
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

                    // Sync Human-Readable Ledger for Purchase
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
              case 'payment_received': {
                // Future-proofing for revenue protection
                if (payload.business_id && payload.status === 'verified') {
                   // Possible trigger for UI confetti or activation
                }
                break;
              }
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
          const maxServerTime = Math.max(...allIncoming.map(e => e.server_timestamp));
          await db.settings.put({ key: 'last_synced', value: maxServerTime });
        });
      }

      // Phase 4 Hardening: Auto-Unlock Feature
      // Silently refresh the business status from the cloud to detect manual engineer unlocks
      const { data: remoteBiz } = await supabase
        .from('businesses')
        .select('package_id, expiry_date, status, staff_count, custom_feature_count, enabled_features, staff_permissions, trial_used, suspended_revenue_count')
        .eq('id', bizId)
        .maybeSingle();

      if (remoteBiz) {
        const updatePayload = mapBusinessFromSync(remoteBiz);
        await db.businesses.update(bizId, updatePayload);
        
        // Update server time reference for drift protection
        localStorage.setItem(`entitlement_${bizId}_last_sync`, Date.now().toString());
      }

    } catch (err: unknown) {
      console.error('Pull failed:', err);
    }
  }, [businessId]);

  /**
   * Integrity Auditor: Compares local event count with remote to detect drift.
   */
  const auditIntegrity = useCallback(async () => {
    if (!navigator.onLine || !businessId) return;
    
    try {
      const localCount = await db.pos_events.where('business_id').equals(businessId).count();
      const { count: remoteCount, error } = await supabase
        .from('pos_events')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId);
      
      if (error) throw error;

      if (remoteCount !== null && remoteCount > localCount) {
        console.warn(`[ESA] Integrity Drift Detected: Local(${localCount}) vs Remote(${remoteCount}). Triggering repair...`);
        setSyncHealth(Math.round((localCount / remoteCount) * 100));
        await pullRemoteChanges();
      } else {
        setSyncHealth(100);
      }
    } catch (err) {
      console.warn('[ESA] Integrity Audit skipped:', err);
    }
  }, [businessId, pullRemoteChanges]);

  const syncAll = useCallback(async () => {
    if (!navigator.onLine) return;

    if (isSyncingRef.current) {
      needsSyncRef.current = true;
      console.log('[ESA] Sync in progress. Queued follow-up.');
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
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Sync failed');
      } finally {
        if (needsSyncRef.current) {
          needsSyncRef.current = false;
          console.log('[ESA] Executing queued sync...');
          await performSync();
        } else {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }
      }
    };

    await performSync();
    await auditIntegrity();
  }, [auditIntegrity, pullRemoteChanges, pushLocalChanges]); 

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
        // Clear EVERYTHING for this business to rebuild a perfect source of truth
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

      // Reset sync cursor and pull all again
      localStorage.removeItem('initial_sync_done');
      await syncAll();
      
      console.log("[ESA] State successfully reconstructed from ledger.");
    } catch (err) {
      console.error("Reconstruction failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [businessId, syncAll]);

  useEffect(() => {
    if (isOnline) syncAll();
  }, [isOnline, syncAll]);

  // Phase 1: Realtime Subscription Implementation (Hardened Singleton)
  useEffect(() => {
    if (!businessId || !isOnline) return;

    const channelId = `business_events_${businessId}`;
    let sub = activeChannels.get(channelId);

    if (!sub) {
      console.log(`[ESA] Initializing Global Realtime Subscription for Business: ${businessId}`);
      const channel = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'pos_events',
            filter: `business_id=eq.${businessId}`
          },
          (payload) => {
            console.log('[ESA] Remote event detected via Realtime.', payload);
            syncAll();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[ESA] Global Realtime subscription active.');
          }
        });
      
      sub = { channel, refCount: 1 };
      activeChannels.set(channelId, sub);
    } else {
      // Revival: If a timer is running, cancel it
      if (sub.cleanupTimer) {
        clearTimeout(sub.cleanupTimer);
        sub.cleanupTimer = undefined;
        console.log(`[ESA] Revived existing Realtime channel: ${channelId}`);
      }
      sub.refCount++;
    }

    return () => {
      if (sub) {
        sub.refCount--;
        if (sub.refCount <= 0) {
          // Debounced Cleanup: Wait 3 seconds before actually closing
          sub.cleanupTimer = setTimeout(() => {
            const currentSub = activeChannels.get(channelId);
            if (currentSub && currentSub.refCount <= 0) {
              const state = currentSub.channel.state;
              if (state === 'joined' || state === 'joining') {
                supabase.removeChannel(currentSub.channel).then(() => {
                  activeChannels.delete(channelId);
                  console.log('[ESA] Global Realtime subscription released.');
                }).catch(err => {
                  console.warn('[ESA] Failed to release subscription gracefully:', err);
                  activeChannels.delete(channelId);
                });
              } else {
                activeChannels.delete(channelId);
              }
            }
          }, 3000); // 3-second grace period
        }
      }
    };
  }, [businessId, isOnline, syncAll]);

  // Phase 2: Heartbeat & Integrity Drift Protection
  useEffect(() => {
    if (!isOnline || !businessId) return;

    // Heartbeat Sync: Catch-all for failed realtime events
    const heartbeat = setInterval(() => {
      console.log('[ESA] 30s Heartbeat Sync triggered.');
      syncAll();
    }, 30000);

    return () => clearInterval(heartbeat);
  }, [isOnline, businessId, syncAll]);

  // Phase 3: Instant Local Push
  const pendingCount = useLiveQuery(() => db.pos_events.where('sync_status').equals('pending').count());
  
  useEffect(() => {
    if (isOnline && pendingCount && pendingCount > 0) {
      console.log(`[ESA] Instant Local Push triggered by ${pendingCount} pending events.`);
      syncAll();
    }
  }, [isOnline, pendingCount, syncAll]);

  // Helper to map Supabase snake_case business records to Dexie camelCase
  function mapBusinessFromSync(remote: Record<string, unknown>): Partial<Business> {
    const mapped: Record<string, unknown> = { ...remote };
    
    // Explicit Mappings
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
    
    // Cleanup snake_case keys that we successfully mapped
    const snakeKeys = [
      'package_id', 'expiry_date', 'trial_used', 'staff_count', 
      'custom_feature_count', 'enabled_features', 'staff_permissions', 
      'suspended_revenue_count', 'mpesa_config'
    ];
    snakeKeys.forEach(key => delete mapped[key]);
    
    return mapped;
  }

  return {
    isOnline,
    isSyncing,
    syncError,
    syncHealth,
    syncAll,
    rebuildState
  };
}

export function useSyncStatus() {
  const pendingCount = useLiveQuery(() => db.pos_events.where('sync_status').equals('pending').count()) || 0;
  const { isOnline, isSyncing, syncHealth } = useSync();
  return { pendingCount, isOnline, isSyncing, syncHealth };
}
