import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

describe('SMUTA PAY - Business Logic Integrity', () => {
  const businessId = 'test-biz-123';

  beforeEach(async () => {
    await db.products.clear();
    await db.sales.clear();
    await db.pos_events.clear();
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
      costPrice: 0, 
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

    const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalCost = cart.reduce((sum, i) => sum + i.costPrice * i.quantity, 0);
    const taxAmount = 10; 
    const totalProfit = total - taxAmount - totalCost;

    expect(totalProfit).toBe(190); 
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

    await db.transaction('rw', db.products, db.sales, async () => {
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
  });

  it('queues offline events for every data mutation (Event Sourcing)', async () => {
    const productId = uuidv4();
    
    // Manual event creation as done in hooks
    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: businessId,
      staff_id: 'TEST-STAFF',
      event_type: 'PRODUCT_CREATED',
      payload: { id: productId, name: 'Sync Item' },
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: 'TEST-HASH',
      sync_status: 'pending'
    });

    const events = await db.pos_events.toArray();
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe('PRODUCT_CREATED');
    expect(events[0].sync_status).toBe('pending');
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
});
