import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '../db/db';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { useAuth } from './useAuth';

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
    
    await db.transaction('rw', db.products, db.sync_queue, db.counters, db.settings, async () => {
      await db.products.add(newProduct);
      await db.sync_queue.add({
        id: await generateTraceableId('ORD', businessId, business.code, deviceId),
        action: 'INSERT',
        table: 'products',
        payload: newProduct,
        timestamp: Date.now(),
        status: 'pending',
        errorCount: 0
      });
    });
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    await db.transaction('rw', db.products, db.sync_queue, db.counters, db.settings, async () => {
      const deviceId = await getDeviceId();
      await db.products.update(id, { ...updates, updatedAt: Date.now() });
      await db.sync_queue.add({
        id: await generateTraceableId('PRD', businessId!, business!.code, deviceId),
        action: 'UPDATE',
        table: 'products',
        payload: { id, ...updates },
        timestamp: Date.now(),
        status: 'pending',
        errorCount: 0
      });
    });
  };

  const deleteProduct = async (id: string) => {
    await db.transaction('rw', db.products, db.sync_queue, db.counters, db.settings, async () => {
      const deviceId = await getDeviceId();
      await db.products.delete(id);
      await db.sync_queue.add({
        id: await generateTraceableId('PRD', businessId!, business!.code, deviceId),
        action: 'DELETE',
        table: 'products',
        payload: { id },
        timestamp: Date.now(),
        status: 'pending',
        errorCount: 0
      });
    });
  };

  const restockProduct = async (id: string, quantityToAdd: number) => {
    const product = await db.products.get(id);
    if (product) {
      await db.transaction('rw', [db.products, db.sync_queue, db.inventory_ledger, db.counters, db.settings], async () => {
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

        await db.sync_queue.add({
          id: await generateTraceableId('LED', businessId!, business!.code, deviceId),
          action: 'INSERT',
          table: 'inventory_ledger',
          payload: ledgerEvent,
          timestamp: Date.now(),
          status: 'pending',
          errorCount: 0
        });
      });
    }
  };

  const getLowStockProducts = () => {
    return products.filter(p => p.quantity <= p.lowStockThreshold);
  };

  return {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    restockProduct,
    getLowStockProducts,
  };
}
