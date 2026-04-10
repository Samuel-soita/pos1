import Dexie, { type EntityTable } from 'dexie';

export interface Product {
  id: string; // UUID
  businessId: string;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: number;
  category?: string;
  barcode?: string;
}

export interface Sale {
  id: string; // UUID
  businessId: string;
  total: number;
  totalProfit: number;
  timestamp: number;
  receiptId: string;
  items: Array<{ productId: string; name: string; quantity: number; price: number; costPrice: number }>;
  taxRate?: number;
  taxAmount?: number;
  paymentMethod?: string;
  transactionCode?: string;
  deviceId?: string;
}

export interface Purchase {
  id: string; // UUID
  businessId: string;
  total: number;
  timestamp: number;
  items: Array<{ productId: string; name: string; quantity: number; price: number }>;
}

export interface Expense {
  id: string; // UUID
  businessId: string;
  title: string;
  amount: number;
  category: string;
  timestamp: number;
  isRecurring?: boolean;
}

export interface RecurringExpense {
  id: string; // UUID
  businessId: string;
  title: string;
  amount: number;
  category: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  nextRun: number;
  isActive: boolean;
}

export interface Business {
  id: string; // UUID (links to Supabase Auth UID)
  name: string;
  code: string; // 4-digit code (0001+)
  pin: string; // 4-digit PIN
  packageId: 'hustler' | 'biashara' | 'boss';
  expiryDate: number;
  status: 'active' | 'expired' | 'locked';
  staffCount: number;
  customFeatureCount?: number;
}

export interface Staff {
  id: string; // UUID
  businessId: string;
  code: string; // 3-digit code per business (001+)
  pin: string; // 4-digit PIN
  idNumber: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'suspended';
}

export interface SyncQueueItem {
  id: string; // UUID
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'STOCK_DELTA' | 'VERIFY_PAYMENT';
  table: 'products' | 'sales' | 'purchases' | 'businesses' | 'staff' | 'expenses' | 'recurring_expenses';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  timestamp: number;
  status: 'pending' | 'failed';
  errorCount: number;
  lastError?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

const db = new Dexie('POSDatabase') as Dexie & {
  products: EntityTable<Product, 'id'>;
  sales: EntityTable<Sale, 'id'>;
  purchases: EntityTable<Purchase, 'id'>;
  expenses: EntityTable<Expense, 'id'>;
  recurring_expenses: EntityTable<RecurringExpense, 'id'>;
  businesses: EntityTable<Business, 'id'>;
  staff: EntityTable<Staff, 'id'>;
  sync_queue: EntityTable<SyncQueueItem, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

// Version 9 adds compound indexes for optimized auth queries
db.version(9).stores({
  products: 'id, businessId, name, price, costPrice, quantity, category, barcode',
  sales: 'id, businessId, total, totalProfit, timestamp, receiptId, paymentMethod, deviceId',
  purchases: 'id, businessId, total, timestamp',
  expenses: 'id, businessId, timestamp, category',
  recurring_expenses: 'id, businessId, frequency, nextRun, isActive',
  businesses: 'id, code, name, packageId, [name+code+pin]',
  staff: 'id, businessId, code, idNumber, phoneNumber, [businessId+code+pin]',
  sync_queue: 'id, action, table, timestamp, status, errorCount',
  settings: 'key'
});

export { db };

// Initialize unique Device ID if missing
async function initDeviceId() {
  const existing = await db.settings.get('device_id');
  if (!existing) {
    const newId = `DEV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    await db.settings.add({ key: 'device_id', value: newId });
    console.log(`Initialized Local Device ID: ${newId}`);
  }
}
initDeviceId();
