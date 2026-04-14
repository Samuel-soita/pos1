import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '../db/db';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { useAuth } from './useAuth';
import { v4 as uuidv4 } from 'uuid';

export function useInventory(branchFilter?: string) {
  const { businessId, business, branchId, userType } = useAuth();
  
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

  const addProduct = async (product: Omit<Product, 'id' | 'businessId' | 'updatedAt'>) => {
    if (!businessId || !business) return;
    const deviceId = await getDeviceId();
    const id = await generateTraceableId('PRD', businessId, business.code, deviceId);
    const newProduct = { 
      ...product, 
      id, 
      businessId, 
      branchId: product.branchId || branchId || undefined, 
      barcode: product.barcode || '', 
      updatedAt: Date.now(),
      syncStatus: 'pending' as const
    };
    
    await db.transaction('rw', db.products, db.pos_events, db.counters, db.settings, async () => {
      await db.products.add(newProduct);
      
      const payload = newProduct;
      const eventHash = await generateEventHash(payload);
      
      await db.pos_events.add({
        event_id: await generateTraceableId('ORD', businessId, business.code, deviceId),
        business_id: businessId,
        staff_id: userType === 'owner' ? 'owner' : (userType || 'unknown'),
        event_type: 'PRODUCT_CREATED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  };

  const bulkAddProducts = async (items: Array<Partial<Product>>) => {
    if (!businessId || !business) return;

    await db.transaction('rw', [db.products, db.pos_events, db.counters, db.settings], async () => {
      const deviceId = await getDeviceId();
      const now = Date.now();

      for (const item of items) {
        const id = uuidv4();
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

        const eventHash = await generateEventHash(payload);
        await db.pos_events.add({
          event_id: await generateTraceableId('PRD', businessId, business.code, deviceId),
          business_id: businessId,
          staff_id: userType === 'owner' ? 'owner' : (userType || 'unknown'),
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

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    await db.transaction('rw', db.products, db.pos_events, db.counters, db.settings, async () => {
      const deviceId = await getDeviceId();
      await db.products.update(id, { ...updates, updatedAt: Date.now() });
      
      const payload = { id, ...updates };
      const eventHash = await generateEventHash(payload);

      await db.pos_events.add({
        event_id: await generateTraceableId('PRD', businessId!, business!.code, deviceId),
        business_id: businessId!,
        staff_id: userType === 'owner' ? 'owner' : (userType || 'unknown'),
        event_type: 'PRODUCT_UPDATED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  };

  const deleteProduct = async (id: string) => {
    await db.transaction('rw', db.products, db.pos_events, db.counters, db.settings, async () => {
      const deviceId = await getDeviceId();
      await db.products.delete(id);
      
      const payload = { id };
      const eventHash = await generateEventHash(payload);

      await db.pos_events.add({
        event_id: await generateTraceableId('PRD', businessId!, business!.code, deviceId),
        business_id: businessId!,
        staff_id: userType === 'owner' ? 'owner' : (userType || 'unknown'),
        event_type: 'PRODUCT_DELETED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  };

  const restockProduct = async (id: string, quantityToAdd: number) => {
    const product = await db.products.get(id);
    if (product) {
      await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
        const deviceId = await getDeviceId();
        await db.products.update(id, { quantity: product.quantity + quantityToAdd, updatedAt: Date.now() });
        
        // Log event to local ledger
        const ledgerEvent = {
          id: await generateTraceableId('INV', businessId!, business!.code, deviceId),
          businessId: businessId!,
          productId: id,
          action: 'ADD' as const,
          quantity: quantityToAdd,
          recordedAt: Date.now(),
          syncStatus: 'pending' as const
        };
        await db.inventory_ledger.add(ledgerEvent);

        const eventHash = await generateEventHash(ledgerEvent);

        await db.pos_events.add({
          event_id: await generateTraceableId('LED', businessId!, business!.code, deviceId),
          business_id: businessId!,
          staff_id: userType === 'owner' ? 'owner' : (userType || 'unknown'),
          event_type: 'INVENTORY_RESTOCKED',
          payload: ledgerEvent,
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
      });
    }
  };

  const auditProduct = async (id: string, physicalCount: number) => {
    const product = await db.products.get(id);
    if (!product || !businessId || !business) return;

    const variance = physicalCount - product.quantity;
    if (variance === 0) return;

    await db.transaction('rw', [db.products, db.pos_events, db.inventory_ledger, db.counters, db.settings], async () => {
      const deviceId = await getDeviceId();
      const now = Date.now();

      // 1. Update Snapshot
      await db.products.update(id, { quantity: physicalCount, updatedAt: now });

      // 2. Log to Ledger
      const ledgerEvent = {
        id: await generateTraceableId('INV', businessId, business.code, deviceId),
        businessId,
        productId: id,
        action: 'AUDIT' as const,
        quantity: variance, // Negative means lost, Positive means found
        recordedAt: now,
        syncStatus: 'pending' as const
      };
      await db.inventory_ledger.add(ledgerEvent);

      // 3. Log to Events (Sync)
      const eventHash = await generateEventHash(ledgerEvent);
      await db.pos_events.add({
        event_id: await generateTraceableId('LED', businessId, business.code, deviceId),
        business_id: businessId,
        staff_id: userType === 'owner' ? 'owner' : (userType || 'unknown'),
        event_type: 'INVENTORY_AUDITED',
        payload: { productId: id, physicalCount, variance, previousCount: product.quantity },
        client_timestamp: now,
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  };

  const getLowStockProducts = () => {
    return products.filter(p => p.quantity <= p.lowStockThreshold);
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
