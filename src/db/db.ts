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
}

export interface Sale {
  id: string; // UUID
  businessId: string;
  total: number;
  totalProfit: number;
  timestamp: number;
  receiptId: string;
  items: Array<{ productId: string; name: string; quantity: number; price: number; costPrice: number }>;
}

export interface Purchase {
  id: string; // UUID
  businessId: string;
  total: number;
  timestamp: number;
  items: Array<{ productId: string; name: string; quantity: number; price: number }>;
}

export interface SyncQueueItem {
  id: string; // UUID
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'STOCK_DELTA';
  table: 'products' | 'sales' | 'purchases';
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
  sync_queue: EntityTable<SyncQueueItem, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

// Version 4 adds DLQ fields to sync_queue
db.version(4).stores({
  products: 'id, businessId, name, price, costPrice, quantity',
  sales: 'id, businessId, total, totalProfit, timestamp, receiptId',
  purchases: 'id, businessId, total, timestamp',
  sync_queue: 'id, action, table, timestamp, status, errorCount',
  settings: 'key'
});

export { db };
