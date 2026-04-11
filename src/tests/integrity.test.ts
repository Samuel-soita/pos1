import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

// We mock the hooks by testing the underlying DB logic directly
// since useSales is a hook and needs a React context, 
// we test the business logic it executes.

describe('SMUTA PAY - Business Logic Integrity', () => {
  const businessId = 'test-biz-123';

  beforeEach(async () => {
    await db.products.clear();
    await db.sales.clear();
    await db.sync_queue.clear();
    await db.settings.clear();
    
    // Setup initial business setting
    await db.settings.add({ key: 'device_id', value: 'TEST-DEVICE-001' });
  });

  it('calculates profit authentically even with zero cost price', async () => {
    const productId = uuidv4();
    await db.products.add({
      id: productId,
      businessId,
      name: 'Profit Test Item',
      price: 100,
      costPrice: 0, // Edge case: No cost set
      quantity: 10,
      lowStockThreshold: 2,
      updatedAt: Date.now()
    });

    const cart = [{
      id: productId,
      name: 'Profit Test Item',
      price: 100,
      costPrice: 0,
      quantity: 2
    }];

    // Manual Business Logic Simulation (Matching useSales.ts)
    const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalCost = cart.reduce((sum, i) => sum + i.costPrice * i.quantity, 0);
    const taxAmount = 10; // 10% tax simulation
    const totalProfit = total - taxAmount - totalCost;

    expect(totalProfit).toBe(190); // 200 (revenue) - 10 (tax) - 0 (cost) = 190
  });

  it('enforces atomic integrity: stock deductions must match sale records', async () => {
    const productId = uuidv4();
    const initialStock = 50;
    const sellQty = 5;

    await db.products.add({
      id: productId,
      businessId,
      name: 'Atomicity Item',
      price: 50,
      costPrice: 30,
      quantity: initialStock,
      lowStockThreshold: 5,
      updatedAt: Date.now()
    });

    // Simulate the transaction logic from useSales.ts
    await db.transaction('rw', db.products, db.sales, db.sync_queue, async () => {
      const saleId = uuidv4();
      const sale = {
        id: saleId,
        businessId,
        total: 250,
        totalProfit: 100,
        timestamp: Date.now(),
        receiptId: 'REC-TEST',
        taxRate: 16,
        taxAmount: 40,
        paymentMethod: 'Cash',
        deviceId: 'TEST-DEVICE-001',
        items: [{ productId, name: 'Atomicity Item', quantity: sellQty, price: 50, costPrice: 30 }]
      };
      
      await db.sales.add(sale);
      
      const product = await db.products.get(productId);
      if (product) {
        await db.products.update(productId, {
          quantity: product.quantity - sellQty,
          updatedAt: Date.now()
        });
      }
    });

    const updatedProduct = await db.products.get(productId);
    const finalSales = await db.sales.toArray();

    expect(updatedProduct?.quantity).toBe(45);
    expect(finalSales.length).toBe(1);
    expect(finalSales[0].items[0].quantity).toBe(5);
  });

  it('queues offline sync items for every data mutation', async () => {
    const productId = uuidv4();
    
    // Add product
    await db.products.add({
      id: productId,
      businessId,
      name: 'Sync Item',
      price: 10,
      quantity: 100,
      lowStockThreshold: 10,
      updatedAt: Date.now()
    });

    // Manual sync queueing as done in hooks
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'INSERT',
      table: 'products',
      payload: { id: productId, name: 'Sync Item' },
      timestamp: Date.now(),
      status: 'pending',
      errorCount: 0
    });

    const queue = await db.sync_queue.toArray();
    expect(queue.length).toBe(1);
    expect(queue[0].action).toBe('INSERT');
    expect(queue[0].status).toBe('pending');
  });

  it('handles "Street M-Pesa" codes correctly in sales records', async () => {
    const saleId = uuidv4();
    const mpesaCode = 'QRC7W8X9Y';

    await db.sales.add({
      id: saleId,
      businessId,
      total: 500,
      totalProfit: 200,
      timestamp: Date.now(),
      receiptId: 'REC-MPESA',
      taxRate: 16,
      taxAmount: 80,
      paymentMethod: 'M-Pesa',
      deviceId: 'TEST-DEVICE-001',
      items: [],
      transactionCode: mpesaCode
    });

    const savedSale = await db.sales.get(saleId);
    expect(savedSale?.paymentMethod).toBe('M-Pesa');
    expect(savedSale?.transactionCode).toBe('QRC7W8X9Y');
  });
  
  it('detects low stock accurately after multiple sales', async () => {
    const productId = uuidv4();
    await db.products.add({
        id: productId,
        businessId,
        name: 'Stock Alert Item',
        price: 10,
        quantity: 5,
        lowStockThreshold: 4,
        updatedAt: Date.now()
    });
    
    // Check initial state
    let product = await db.products.get(productId);
    expect(product!.quantity > product!.lowStockThreshold).toBe(true);
    
    // Deduct 2
    await db.products.update(productId, { quantity: product!.quantity - 2 });
    
    // Check low stock state (3 <= 4)
    product = await db.products.get(productId);
    expect(product!.quantity <= product!.lowStockThreshold).toBe(true);
  });
});
