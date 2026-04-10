import { useState } from 'react';
import { db, type Product } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './useAuth';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  quantity: number;
}

export function useSales() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const sales = useLiveQuery(() => db.sales.orderBy('timestamp').reverse().toArray()) || [];
  const { businessId } = useAuth();

  const addToCart = (product: Product) => {
    if (!product.id) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { 
        id: product.id!, 
        name: product.name, 
        price: product.price, 
        costPrice: product.costPrice ?? (product.price * 0.7), // Fallback if no cost set
        quantity: 1 
      }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateCartQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) return removeFromCart(id);
    setCart(prev =>
      prev.map(item => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => setCart([]);

  const completeSale = async (taxRate: number = 0, taxAmount: number = 0, paymentMethod: string = 'Cash', transactionCode?: string) => {
    if (cart.length === 0 || !businessId) return;

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalCost = cart.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
    // Correct Profit Calculation: Profit is Revenue minus Tax minus Cost of Goods
    const totalProfit = total - taxAmount - totalCost;
    
    const receiptId = `REC-${Date.now()}`;
    const timestamp = Date.now();
    const deviceId = (await db.settings.get('device_id'))?.value as string || 'UNKNOWN';

    const saleItems = cart.map(item => ({
      productId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      costPrice: item.costPrice,
    }));

    // Start a transaction to ensure atomic updates
    try {
      await db.transaction('rw', db.products, db.sales, db.sync_queue, async () => {
        // 1. Record the sale locally
        const newSale = {
          id: uuidv4(),
          businessId,
          total,
          totalProfit,
          timestamp,
          receiptId,
          items: saleItems,
          taxRate,
          taxAmount,
          paymentMethod,
          transactionCode,
          deviceId,
        };
        await db.sales.add(newSale);
        
        // Queue the sale for cloud sync
        await db.sync_queue.add({
          id: uuidv4(),
          action: 'INSERT',
          table: 'sales',
          payload: newSale,
          timestamp: Date.now(),
          status: 'pending',
          errorCount: 0
        });

        // 2. Reduce stock locally and queue sync delta
        for (const item of cart) {
          const product = await db.products.get(item.id);
          if (product) {
            await db.products.update(item.id, {
              quantity: product.quantity - item.quantity,
              updatedAt: Date.now()
            });

            // Queue the stock delta natively so the server knows exactly what happened offline
            await db.sync_queue.add({
              id: uuidv4(),
              action: 'STOCK_DELTA',
              table: 'products',
              payload: { id: item.id, businessId, delta: -item.quantity },
              timestamp: Date.now(),
              status: 'pending',
              errorCount: 0
            });
          }
        }
      });

      clearCart();
      return { success: true, receiptId };
    } catch (error) {
      console.error('Sale transaction failed:', error);
      return { success: false, error };
    }
  };

  return {
    cart,
    sales,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    completeSale,
    cartTotal: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };
}
