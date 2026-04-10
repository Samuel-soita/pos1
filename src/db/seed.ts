import { db } from './db';

export async function seedDatabase() {
  try {
    // Clear existing data for a fresh start
    await db.businesses.clear();
    await db.staff.clear();
    await db.products.clear();
    await db.sales.clear();
    await db.expenses.clear();
    await db.recurring_expenses.clear();

    const businessId = crypto.randomUUID();
    
    // 1. Seed Business
    await db.businesses.add({
      id: businessId,
      name: 'SMUTA Hardware',
      code: '0001',
      pin: '1234',
      packageId: 'biashara',
      expiryDate: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days (Trial)
      status: 'active',
      staffCount: 1,
      customFeatureCount: 0
    });

    // 2. Seed Staff (Owner)
    await db.staff.add({
      id: crypto.randomUUID(),
      businessId: businessId,
      code: '001',
      pin: '0000',
      idNumber: '12345678',
      phoneNumber: '0700000000',
      firstName: 'John',
      lastName: 'Doe',
      status: 'active'
    });

    // 3. Seed Sample Products
    const products = [
      { id: crypto.randomUUID(), businessId, name: 'Cement (50kg)', price: 850, costPrice: 750, quantity: 100, lowStockThreshold: 10, updatedAt: Date.now(), category: 'Building' },
      { id: crypto.randomUUID(), businessId, name: 'Iron Sheet (G28)', price: 1200, costPrice: 1050, quantity: 50, lowStockThreshold: 5, updatedAt: Date.now(), category: 'Roofing' },
      { id: crypto.randomUUID(), businessId, name: 'Nails (4 inch) 1kg', price: 150, costPrice: 120, quantity: 200, lowStockThreshold: 20, updatedAt: Date.now(), category: 'Building' },
      { id: crypto.randomUUID(), businessId, name: 'Paint (Brilliant White) 4L', price: 1800, costPrice: 1600, quantity: 15, lowStockThreshold: 3, updatedAt: Date.now(), category: 'Finishing' }
    ];
    await db.products.bulkAdd(products);

    // 4. Seed Sample Expenses
    await db.expenses.bulkAdd([
      { id: crypto.randomUUID(), businessId, title: 'Shop Rent (April)', amount: 15000, category: 'Rent', timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 },
      { id: crypto.randomUUID(), businessId, title: 'Electricity Bill', amount: 1200, category: 'Utilities', timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000 }
    ]);

    // 5. Seed Recurring Template
    await db.recurring_expenses.add({
      id: crypto.randomUUID(),
      businessId,
      title: 'Internet Fiber',
      amount: 3000,
      category: 'Utilities',
      frequency: 'monthly',
      nextRun: Date.now() + 10 * 24 * 60 * 60 * 1000,
      isActive: true
    });

    console.log('✅ DATABASE FULLY SEEDED: Business, Staff, Products, and Expenses ready.');
    return true;
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    return false;
  }
}

// Automatically expose to window for easy console access
(window as unknown as { seedPOS: typeof seedDatabase }).seedPOS = seedDatabase;
