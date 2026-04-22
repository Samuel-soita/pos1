import Dexie, { type EntityTable } from 'dexie';

export interface Product {
  id: string; // UUID
  businessId: string;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  lowStockThreshold?: number;
  updatedAt: number;
  category?: string;
  barcode?: string;
  branchId?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface Counter {
  id: string; // businessId_entityType
  businessId: string;
  entityType: string;
  count: number;
}

// ==========================================
// NEW EVENT-SOURCED ARCHITECTURE
// ==========================================

export interface POSEvent {
  event_id: string; // UUIDv4
  business_id: string;
  staff_id: string;
  event_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  client_timestamp: number;
  server_timestamp: number;
  hash: string;
  sync_status: 'pending' | 'synced' | 'failed' | 'rejected_dlq';
  retry_count?: number;
  last_error?: string;
}

export interface MaterializedSnapshot {
  id: string; // E.g. 'stock_STATUS_VAR'
  business_id: string;
  view_type: 'stock' | 'sales' | 'cash';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  last_applied_event: string;
  updated_at: number;
}

export interface Branch {
  id: string; // UUID
  businessId: string;
  name: string;
  location?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface Shift {
  id: string; // UUID
  businessId: string;
  staffId: string;
  branchId?: string;
  startTime: number;
  endTime?: number;
  totalSales: number;
  cashSales: number;
  mpesaSales: number;
  totalExpenses: number;
  status: 'active' | 'completed';
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  costPrice: number;
}

export interface SplitPayment {
  method: 'Cash' | 'Card' | 'M-Pesa';
  amount: number;
  transactionCode?: string;
}

export interface Sale {
  id: string; // UUID
  businessId: string;
  total: number;
  totalProfit: number;
  timestamp: number;
  receiptId: string;
  items: SaleItem[];
  taxRate: number;
  taxAmount: number;
  paymentMethod: string; // Keep for backward compatibility, or set to 'Split'
  splitPayments?: SplitPayment[]; // Support for multiple methods
  transactionCode?: string;
  deviceId: string;
  branchId?: string;
  staffId?: string; // Track who made the sale
  status?: 'active' | 'voided' | 'returned';
  voidReason?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface Supplier {
  id: string; // UUID
  businessId: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  kraPin?: string;
}

export interface Purchase {
  id: string; // UUID
  businessId: string;
  supplierId?: string;
  total: number;
  timestamp: number;
  items: Array<{ productId: string; name: string; quantity: number; price: number }>;
  paymentStatus: 'paid' | 'pending' | 'partial';
  branchId?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface Expense {
  id: string; // UUID
  businessId: string;
  title: string;
  amount: number;
  description: string;
  timestamp: number;
  category: string;
  receiptImage?: string; // Base64
  status: 'pending' | 'verified' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: number;
  branchId?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface CashLog {
  id: string;
  businessId: string;
  staffId: string;
  date: string; // YYYY-MM-DD
  branchId?: string; // Multi-branch support
  openingFloat: number;
  expectedClosing: number;
  actualClosing?: number;
  discrepancy?: number;
  timestamp: number;
  status: 'open' | 'closed';
  syncStatus?: 'pending' | 'synced' | 'failed';
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
  branchId?: string;
}

export interface Cart {
  id: string; // businessId_staffId (one active cart per person)
  businessId: string;
  staffId: string;
  items: SaleItem[];
  updatedAt: number;
}

export interface Business {
  id: string; // UUID (links to Supabase Auth UID)
  name: string;
  code: string; // 4-digit code (0001+)
  pin: string; // 4-digit PIN
  ownerEmail?: string;
  telephone?: string;
  address?: string;
  kraPin?: string;
  logo?: string; // Base64 logo
  packageId: string; // Dynamic package identifiers for custom plans
  expiryDate: number;
  status: 'trial' | 'grace' | 'active' | 'pending_payment' | 'suspended' | 'pending_verification';
  trialUsed: boolean;
  lastPaymentRef?: string;
  suspendedRevenueCount: number; // Tracks 20-sale limit during suspension
  staffCount: number;
  customFeatureCount?: number;
  enabledFeatures?: string[];
  staffPermissions?: Record<string, boolean>;
  businessType?: 'sole_proprietor' | 'multi_branch';
  mpesaConfig?: {
    payout_destination: string;
    convenience_fee: number;
    is_enabled: boolean;
  };
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
  status: 'active' | 'inactive';
  branchId?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface InventoryLedgerEvent {
  id: string; // trace ID
  businessId: string;
  productId: string;
  action: 'ADD' | 'SALE' | 'REFUND' | 'WASTE' | 'AUDIT' | 'VOID';
  quantity: number;
  recordedAt: number;
  traceId?: string; // Links back to the parent Sale/Expense ID
  syncStatus?: 'pending' | 'synced' | 'failed';
}

const db = new Dexie('POSDatabase') as Dexie & {
  products: EntityTable<Product, 'id'>;
  sales: EntityTable<Sale, 'id'>;
  purchases: EntityTable<Purchase, 'id'>;
  suppliers: EntityTable<Supplier, 'id'>;
  expenses: EntityTable<Expense, 'id'>;
  recurring_expenses: EntityTable<RecurringExpense, 'id'>;
  businesses: EntityTable<Business, 'id'>;
  staff: EntityTable<Staff, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  cash_logs: EntityTable<CashLog, 'id'>;
  shifts: EntityTable<Shift, 'id'>;
  branches: EntityTable<Branch, 'id'>;
  counters: EntityTable<Counter, 'id'>;
  inventory_ledger: EntityTable<InventoryLedgerEvent, 'id'>;
  pos_events: EntityTable<POSEvent, 'event_id'>;
  snapshots: EntityTable<MaterializedSnapshot, 'id'>;
  carts: EntityTable<Cart, 'id'>;
};

db.version(26).stores({
  products: 'id, businessId, branchId, name, price, costPrice, quantity, category, barcode, syncStatus',
  sales: 'id, businessId, [businessId+branchId], [businessId+timestamp], [branchId+timestamp], total, totalProfit, timestamp, receiptId, paymentMethod, deviceId, syncStatus',
  purchases: 'id, businessId, branchId, supplierId, total, timestamp, syncStatus',
  suppliers: 'id, businessId, name, phone, syncStatus',
  expenses: 'id, businessId, [businessId+branchId], [businessId+timestamp], [branchId+timestamp], timestamp, category, status, syncStatus',
  recurring_expenses: 'id, businessId, branchId, frequency, nextRun, isActive, syncStatus',
  businesses: 'id, code, name, packageId, [name+code+pin], syncStatus',
  staff: 'id, businessId, branchId, code, idNumber, phoneNumber, [businessId+code+pin], syncStatus',
  settings: 'key',
  cash_logs: 'id, businessId, branchId, staffId, date, status, [businessId+date], [businessId+branchId+date], syncStatus',
  shifts: 'id, businessId, staffId, [businessId+branchId], [branchId+status], status, startTime, syncStatus',
  branches: 'id, businessId, name, syncStatus',
  counters: 'id, businessId, entityType',
  inventory_ledger: 'id, businessId, productId, recordedAt, traceId, [productId+businessId], syncStatus',
  pos_events: 'event_id, business_id, event_type, server_timestamp, sync_status, retry_count',
  snapshots: 'id, business_id, view_type',
  carts: 'id, businessId, staffId, updatedAt'
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
