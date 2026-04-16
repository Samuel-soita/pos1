import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { db, type Product } from '../db/db';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { useAuth } from './useAuth';

export function useInventory(branchFilter?: string) {
  const { businessId, business, branchId, userType, staffId } = useAuth();
  
  const products = useLiveQuery(async () => {
    if (!businessId) return [];
    
    // Scoping logic
    const effectiveBranchFilter = userType === 'staff' ? branchId : (branchFilter || null);
    
    if (effectiveBranchFilter) {
      return await db.products
        .where('businessId').equals(businessId)
        .filter(p => p.branchId === effectiveBranchFilter)
        .toArray();
    }
    
    return await db.products.where('businessId').equals(businessId).toArray();
  }, [businessId, branchId, userType, branchFilter]) || [];

  const addProduct = useCallback(async (product: Omit<Product, 'id' | 'businessId' | 'updatedAt'>) => {
    if (!businessId || !business) return;
    const deviceId = await getDeviceId();
    const id = await generateTraceableId('PRD', businessId, business?.code, deviceId);
    const newProduct = { 
      ...product, 
      id, 
      businessId, 
      branchId: product.branchId || branchId || undefined, 
      barcode: product.barcode || '', 
      updatedAt: Date.now(),
      syncStatus: 'pending' as const
    };
    
    await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
      await db.products.add(newProduct);
      
      await db.inventory_ledger.add({
        id: await generateTraceableId('INV', businessId, business?.code, deviceId),
        businessId: businessId,
        productId: id,
        action: 'ADD',
        quantity: newProduct.quantity,
        recordedAt: Date.now(),
        syncStatus: 'synced'
      });

      const payload = newProduct;
      const eventHash = await generateEventHash(payload);
      
      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: staffId || (userType === 'owner' ? 'owner' : 'unknown'),
        event_type: 'PRODUCT_CREATED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  }, [businessId, business, branchId, staffId, userType]);

  const bulkAddProducts = async (items: Array<Partial<Product>>) => {
    if (!businessId || !business) return;

    await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
      const deviceId = await getDeviceId();
      const now = Date.now();

      for (const item of items) {
        const id = await generateTraceableId('PRD', businessId, business?.code, deviceId);
        const payload: Product = {
          id,
          businessId,
          name: item.name || 'Unnamed Product',
          price: item.price || 0,
          costPrice: item.costPrice || 0,
          quantity: item.quantity || 0,
          lowStockThreshold: item.lowStockThreshold || 5,
          category: item.category || 'General',
          barcode: item.barcode || '',
          updatedAt: now,
          branchId: branchId || undefined
        };

        await db.products.add(payload);

        // Update Human-Readable Ledger (Local + Replicable)
        await db.inventory_ledger.add({
          id: await generateTraceableId('INV', businessId, business?.code, deviceId),
          businessId,
          productId: id,
          action: 'ADD',
          quantity: payload.quantity,
          recordedAt: now,
          syncStatus: 'synced'
        });

        const eventHash = await generateEventHash(payload);
        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
          business_id: businessId,
          staff_id: staffId || 'UNKNOWN',
          event_type: 'PRODUCT_CREATED',
          payload,
          client_timestamp: now,
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
      }
    });
  };
  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    if (!businessId || !business) return;
    const existing = await db.products.get(id);
    if (!existing) return;

    await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
      const deviceId = await getDeviceId();
      await db.products.update(id, { ...updates, updatedAt: Date.now() });
      
      if (updates.price !== undefined && updates.price !== existing.price) {
        await db.inventory_ledger.add({
          id: await generateTraceableId('INV', businessId, business.code, deviceId),
          businessId,
          productId: id,
          action: 'AUDIT',
          quantity: 0,
          recordedAt: Date.now(),
          syncStatus: 'synced',
          traceId: `PRICE_CHANGE_${existing.price}->${updates.price}`
        });
      }

      const payload = { id, ...updates };
      const eventHash = await generateEventHash(payload);

      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: staffId || (userType === 'owner' ? 'owner' : 'unknown'),
        event_type: 'PRODUCT_UPDATED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  }, [businessId, business, staffId, userType]);

  const deleteProduct = useCallback(async (id: string) => {
    if (!businessId || !business) return;
    await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
      const deviceId = await getDeviceId();
      await db.products.delete(id);
      
      const payload = { id };
      const eventHash = await generateEventHash(payload);

      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: staffId || (userType === 'owner' ? 'owner' : 'unknown'),
        event_type: 'PRODUCT_DELETED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  }, [businessId, business, staffId, userType]);

  const restockProduct = useCallback(async (id: string, quantityToAdd: number) => {
    if (!businessId || !business) return;
    const product = await db.products.get(id);
    if (product) {
      await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
        const deviceId = await getDeviceId();
        await db.products.update(id, { quantity: product.quantity + quantityToAdd, updatedAt: Date.now() });
        
        const ledgerEvent = {
          id: await generateTraceableId('INV', businessId, business?.code, deviceId),
          businessId: businessId,
          productId: id,
          action: 'ADD' as const,
          quantity: quantityToAdd,
          recordedAt: Date.now(),
          syncStatus: 'pending' as const
        };
        await db.inventory_ledger.add(ledgerEvent);

        const eventHash = await generateEventHash(ledgerEvent);

        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
          business_id: businessId,
          staff_id: staffId || (userType === 'owner' ? 'owner' : 'unknown'),
          event_type: 'INVENTORY_RESTOCKED',
          payload: { productId: id, delta: quantityToAdd, action: 'ADD' },
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
      });
    }
  }, [businessId, business, staffId, userType]);

  const auditProduct = useCallback(async (id: string, physicalCount: number) => {
    const product = await db.products.get(id);
    if (!product || !businessId || !business) return;

    if (physicalCount < 0) {
      alert("Physical count cannot be negative.");
      return;
    }

    const variance = physicalCount - product.quantity;
    if (variance === 0) return;

    await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
      const deviceId = await getDeviceId();
      const now = Date.now();

      await db.products.update(id, { quantity: physicalCount, updatedAt: now });

      const ledgerEvent = {
        id: await generateTraceableId('INV', businessId, business?.code, deviceId),
        businessId,
        productId: id,
        action: 'AUDIT' as const,
        quantity: variance,
        recordedAt: now,
        syncStatus: 'pending' as const
      };
      await db.inventory_ledger.add(ledgerEvent);

      const eventHash = await generateEventHash(ledgerEvent);
      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: staffId || 'UNKNOWN',
        event_type: 'INVENTORY_AUDITED',
        payload: { productId: id, physicalCount, variance, previousCount: product.quantity },
        client_timestamp: now,
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  }, [businessId, business, staffId]);

  const getLowStockProducts = () => {
    return products.filter(p => p.quantity <= (p.lowStockThreshold ?? 5));
  };

  return {
    products,
    addProduct,
    bulkAddProducts,
    updateProduct,
    deleteProduct,
    restockProduct,
    auditProduct,
    getLowStockProducts,
  };
}
