import { useState, useCallback } from 'react';
import { db, type Product, type SplitPayment } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { useAuth } from './useAuth';
import { useCashControl } from './useCashControl';
import { useShifts } from './useShifts';
import { useSubscription } from './useSubscription';

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
  const { recordSaleToShift, recordVoidToShift } = useShifts();
  const { isLocked, message: subMessage } = useSubscription();

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

  const addToCart = useCallback(async (product: Product) => {
    if (!product.id) return;
    
    // Hard Stock Lockdown
    const latestProduct = await db.products.get(product.id);
    if (!latestProduct || latestProduct.quantity <= 0) {
      alert(`Product ${product.name} is out of stock!`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= latestProduct.quantity) {
          alert(`Only ${latestProduct.quantity} units remaining in stock.`);
          return prev;
        }
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { 
        id: product.id!, 
        name: product.name, 
        price: product.price, 
        costPrice: product.costPrice ?? (product.price * 0.7),
        quantity: 1 
      }];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateCartQuantity = useCallback(async (id: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== id));
      return;
    }
    
    // Hard Stock Lockdown
    const product = await db.products.get(id);
    if (product && quantity > product.quantity) {
      alert(`Only ${product.quantity} units available.`);
      return;
    }

    setCart(prev =>
      prev.map(item => (item.id === id ? { ...item, quantity } : item))
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const completeSale = useCallback(async (taxRate: number = 0, taxAmount: number = 0, paymentMethod: string = 'Cash', transactionCode?: string, splitPayments?: SplitPayment[]) => {
    if (cart.length === 0 || !businessId) return;
    if (!isRegisterOpen) {
      alert('Register is closed. You must set an opening float before making sales.');
      return;
    }

    if (isLocked) {
      alert(subMessage || 'Subscription locked. Please renew to continue.');
      return;
    }

    const total = Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
    const totalCost = Math.round(cart.reduce((sum, item) => sum + item.costPrice * item.quantity, 0) * 100) / 100;
    const totalProfit = Math.round((total - taxAmount - totalCost) * 100) / 100;
    
    if (!business || !businessId) {
      alert('Business context not fully loaded. Please wait a moment.');
      return { success: false, error: 'BUSINESS_CONTEXT_MISSING' };
    }

    // Capture stable references for closure type safety
    const bId = businessId;
    const bCode = business.code;

    const timestamp = Date.now();
    const deviceId = await getDeviceId();
    const saleId = await generateTraceableId('ORD', bId, bCode, deviceId);
    const receiptId = saleId; 

    const saleItems = cart.map(item => ({
      productId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      costPrice: item.costPrice,
    }));

    try {
      await db.transaction('rw', [db.products, db.sales, db.pos_events, db.snapshots, db.counters, db.settings, db.shifts, db.inventory_ledger], async () => {
        // 1. Immutable Event Generation (Sale)
        const salePayload = {
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
        };
        
        const saleHash = await generateEventHash(salePayload);

        const saleEvent = {
          event_id: await generateTraceableId('EVT', bId, bCode, deviceId),
          business_id: bId,
          staff_id: staffId || 'UNKNOWN',
          event_type: 'SALE_CREATED' as const,
          payload: salePayload,
          client_timestamp: timestamp,
          server_timestamp: timestamp,
          hash: saleHash,
          sync_status: 'pending' as const
        };
        await db.pos_events.add(saleEvent);

        // 2. Compute state change locally for instant UI response (Sales Snapshot)
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
          syncStatus: 'synced'
        });
        
            for (const item of cart) {
              const product = await db.products.get(item.id);
              
              if (!product || product.quantity < item.quantity) {
                throw new Error(`CRITICAL: ${item.name} went out of stock! Another device or tab might have sold it.`);
              }

              const stockPayload = { 
                productId: item.id, 
                delta: -item.quantity,
                branchId: branchId || product.branchId
              };
              const stockHash = await generateEventHash(stockPayload);

              await db.pos_events.add({
                event_id: await generateTraceableId('EVT', bId, bCode, deviceId),
                business_id: bId,
                staff_id: staffId || 'UNKNOWN',
                event_type: 'STOCK_RESERVED',
                payload: stockPayload,
                client_timestamp: timestamp,
                server_timestamp: timestamp,
                hash: stockHash,
                sync_status: 'pending'
              });

              await db.products.update(item.id, {
                quantity: Math.round((product.quantity - item.quantity) * 100) / 100,
                updatedAt: Date.now()
              });

              await db.inventory_ledger.add({
                id: await generateTraceableId('INV', bId, bCode, deviceId),
                businessId: bId,
                productId: item.id,
                action: 'SALE',
                quantity: -item.quantity,
                recordedAt: timestamp,
                syncStatus: 'synced'
              });
            }

            await recordSaleToShift(total, paymentMethod, splitPayments);
            
        if (business.status === 'suspended') {
          await db.businesses.update(bId, {
            suspendedRevenueCount: (business.suspendedRevenueCount || 0) + 1
          });
        }
      });

      clearCart();
      return { success: true, receiptId };
    } catch (error) {
      console.error('Sale transaction failed:', error);
      return { success: false, error };
    }
  }, [cart, businessId, isRegisterOpen, isLocked, subMessage, business, branchId, staffId, recordSaleToShift, clearCart]);

  const voidSale = useCallback(async (saleId: string, reason: string) => {
    if (!businessId || !business) return;
    const bId = businessId;
    const bCode = business.code;

    const sale = await db.sales.get(saleId);
    if (!sale || sale.status === 'voided') return;

    try {
      await db.transaction('rw', [db.products, db.sales, db.pos_events, db.counters, db.settings, db.shifts, db.inventory_ledger], async () => {
        const deviceId = await getDeviceId();
        const timestamp = Date.now();

        await db.sales.update(saleId, { status: 'voided', voidReason: reason });

        for (const item of sale.items) {
          const product = await db.products.get(item.productId);
          if (product) {
            await db.products.update(item.productId, {
              quantity: product.quantity + item.quantity,
              updatedAt: Date.now()
            });

            await db.inventory_ledger.add({
              id: await generateTraceableId('INV', bId, bCode, deviceId),
              businessId: bId,
              productId: item.productId,
              action: 'VOID',
              quantity: item.quantity,
              recordedAt: timestamp,
              syncStatus: 'synced'
            });

            const stockPayload = { productId: item.productId, delta: item.quantity, reason: 'VOID' };
            const stockHash = await generateEventHash(stockPayload);
            await db.pos_events.add({
              event_id: await generateTraceableId('EVT', bId, bCode, deviceId),
              business_id: bId,
              staff_id: staffId || 'OWNER',
              event_type: 'STOCK_RESTORED',
              payload: stockPayload,
              client_timestamp: timestamp,
              server_timestamp: timestamp,
              hash: stockHash,
              sync_status: 'pending'
            });
          }
        }

        await recordVoidToShift(sale.total, sale.paymentMethod, sale.splitPayments);

        const voidPayload = { saleId, reason };
        const voidHash = await generateEventHash(voidPayload);
        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', bId, bCode, deviceId),
          business_id: bId,
          staff_id: staffId || 'OWNER',
          event_type: 'SALE_VOIDED',
          payload: voidPayload,
          client_timestamp: timestamp,
          server_timestamp: timestamp,
          hash: voidHash,
          sync_status: 'pending'
        });
      });

      return { success: true };
    } catch (error) {
      console.error('Void failed:', error);
      return { success: false, error };
    }
  }, [businessId, business, staffId, recordVoidToShift]);

  return {
    cart,
    sales,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    completeSale,
    voidSale,
    cartTotal: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };
}
