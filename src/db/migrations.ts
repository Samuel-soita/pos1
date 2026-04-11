import { db } from './db';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';

export async function runMigrations() {
  const isMigrated = await db.settings.get('id_migration_v1');
  if (isMigrated?.value === true) return;

  console.log('Starting ID Format Migration...');
  
  const deviceId = await getDeviceId();
  const businesses = await db.businesses.toArray();

  for (const biz of businesses) {
    // 1. Migrate Products
    const products = await db.products.where('businessId').equals(biz.id).toArray();
    for (const p of products) {
      if (isUUID(p.id)) {
        const newId = await generateTraceableId('PRD', biz.id, biz.code, deviceId);
        await db.products.add({ ...p, id: newId });
        await db.products.delete(p.id);
        // Queue for sync as new item
        await db.sync_queue.add({
          id: crypto.randomUUID(),
          action: 'INSERT',
          table: 'products',
          payload: { ...p, id: newId },
          timestamp: Date.now(),
          status: 'pending',
          errorCount: 0
        });
      }
    }

    // 2. Migrate Staff
    const staff = await db.staff.where('businessId').equals(biz.id).toArray();
    for (const s of staff) {
      if (isUUID(s.id)) {
        const newId = await generateTraceableId('STF', biz.id, biz.code, deviceId);
        await db.staff.add({ ...s, id: newId });
        await db.staff.delete(s.id);
        // Note: Supabase will have duplicates unless we handle it, but for now we follow the "transform"
      }
    }

    // 3. Migrate Sales
    const sales = await db.sales.where('businessId').equals(biz.id).toArray();
    for (const s of sales) {
      if (isUUID(s.id)) {
        const newId = await generateTraceableId('ORD', biz.id, biz.code, deviceId);
        await db.sales.add({ ...s, id: newId });
        await db.sales.delete(s.id);
      }
    }

    // 4. Migrate Expenses
    const expenses = await db.expenses.where('businessId').equals(biz.id).toArray();
    for (const e of expenses) {
      if (isUUID(e.id)) {
        const newId = await generateTraceableId('EXP', biz.id, biz.code, deviceId);
        await db.expenses.add({ ...e, id: newId });
        await db.expenses.delete(e.id);
      }
    }
  }

  await db.settings.put({ key: 'id_migration_v1', value: true });
  console.log('ID Migration Completed Successfully.');
}

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
