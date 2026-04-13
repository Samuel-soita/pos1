import { useState } from 'react';
import { db, type Product, type SplitPayment } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { useAuth } from './useAuth';
import { useCashControl } from './useCashControl';
import { useShifts } from './useShifts';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  quantity: number;
}

export function useSales() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const { businessId, business, branchId, userType, staffId } = useAuth();
  const { isRegisterOpen } = useCashControl();
  const { recordSaleToShift } = useShifts();

  const sales = useLiveQuery(async () => {
    if (!businessId) return [];
    const query = db.sales.where('businessId').equals(businessId);
    
    if (userType === 'staff' && branchId) {
       return await db.sales
        .where('businessId').equals(businessId)
        .filter(s => s.branchId === branchId)
        .reverse()
        .toArray();
    }
    
    return await query.reverse().toArray();
  }, [businessId, branchId, userType]) || [];

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

  const completeSale = async (taxRate: number = 0, taxAmount: number = 0, paymentMethod: string = 'Cash', transactionCode?: string, splitPayments?: SplitPayment[]) => {
    if (cart.length === 0 || !businessId) return;
    if (!isRegisterOpen) {
      alert('Register is closed. You must set an opening float before making sales.');
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalCost = cart.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
    const totalProfit = total - taxAmount - totalCost;
    
    const timestamp = Date.now();
    const deviceId = await getDeviceId();
    const saleId = await generateTraceableId('ORD', businessId, business!.code, deviceId);
    const receiptId = saleId; 

    const saleItems = cart.map(item => ({
      productId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      costPrice: item.costPrice,
    }));

    try {
      await db.transaction('rw', [db.products, db.sales, db.pos_events, db.snapshots, db.counters, db.settings], async () => {
        // 1. Immutable Event Generation (Sale)
        const saleEvent = {
          event_id: await generateTraceableId('EVT', businessId, business!.code, deviceId),
          business_id: businessId,
          staff_id: staffId || 'UNKNOWN',
          event_type: 'sale_created' as const,
          payload: {
             id: saleId,
             total,
             totalProfit,
             receiptId,
             items: saleItems,
             taxRate,
             taxAmount,
             paymentMethod,
             splitPayments,
             transactionCode,
             deviceId,
             branchId
          },
          client_timestamp: timestamp,
          server_timestamp: timestamp,
          hash: 'LATER',
          sync_status: 'pending' as const
        };
        await db.pos_events.add(saleEvent);

        // 2. Compute state change locally for instant UI response (Sales Snapshot)
        // For backwards compatibility with standard db.sales, we map the payload to the local sales table view
        await db.sales.add({
          id: saleId,
          businessId,
          total,
          totalProfit,
          timestamp,
          receiptId,
          items: saleItems,
          taxRate,
          taxAmount,
          paymentMethod,
          splitPayments,
          transactionCode,
          deviceId,
          branchId: branchId || undefined,
          staffId: staffId || undefined,
          syncStatus: 'synced' // Marked synced purely for the UI. The real sync queue is pos_events.
        });
        
        // 3. Immutable Event Generation (Stock)
        for (const item of cart) {
          const product = await db.products.get(item.id);
          if (product) {
            const stockEvent = {
              event_id: await generateTraceableId('EVT', businessId, business!.code, deviceId),
              business_id: businessId,
              staff_id: staffId || 'UNKNOWN',
              event_type: 'stock_reserved' as const,
              payload: {
                productId: item.id,
                delta: -item.quantity
              },
              client_timestamp: Date.now(),
              server_timestamp: Date.now(),
              hash: 'LATER',
              sync_status: 'pending' as const
            };
            await db.pos_events.add(stockEvent);

            // Directly update the generic 'products' UI list (Our materialized stock snapshot)
            await db.products.update(item.id, {
              quantity: product.quantity - item.quantity,
              updatedAt: Date.now()
            });
          }
        }
        // 4. Update Emergency Sale Counter if suspended
        if (business!.status === 'suspended') {
          await db.businesses.update(businessId, {
            suspendedRevenueCount: (business!.suspendedRevenueCount || 0) + 1
          });
        }
      });

      // Record to active shift if applicable (Shift system needs refactor eventually but ok for now)
      if (typeof recordSaleToShift === 'function') {
        await recordSaleToShift(total, paymentMethod);
      }

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
