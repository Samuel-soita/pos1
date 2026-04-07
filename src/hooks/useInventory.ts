import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './useAuth';

export function useInventory() {
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const { businessId } = useAuth();

  const addProduct = async (product: Omit<Product, 'id' | 'businessId' | 'updatedAt'>) => {
    if (!businessId) return;
    const id = uuidv4();
    const newProduct = { ...product, id, businessId, updatedAt: Date.now() };
    
    await db.transaction('rw', db.products, db.sync_queue, async () => {
      await db.products.add(newProduct);
      await db.sync_queue.add({
        id: uuidv4(),
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
    await db.transaction('rw', db.products, db.sync_queue, async () => {
      await db.products.update(id, { ...updates, updatedAt: Date.now() });
      await db.sync_queue.add({
        id: uuidv4(),
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
    await db.transaction('rw', db.products, db.sync_queue, async () => {
      await db.products.delete(id);
      await db.sync_queue.add({
        id: uuidv4(),
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
      await db.transaction('rw', db.products, db.sync_queue, async () => {
        await db.products.update(id, { quantity: product.quantity + quantityToAdd, updatedAt: Date.now() });
        await db.sync_queue.add({
          id: uuidv4(),
          action: 'STOCK_DELTA',
          table: 'products',
          payload: { id, businessId: product.businessId, delta: quantityToAdd },
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
