import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CashLog } from '../db/db';
import { useAuth } from './useAuth';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';

export function useCashControl() {
  const { businessId, business, branchId, staff } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const currentLog = useLiveQuery(
    async () => {
      if (!businessId) return null;
      
      // Filter by business, date, and branch for multi-tenant isolation
      const query = db.cash_logs.where({ businessId, date: today });
      
      const logs = await query.toArray();
      // If branchId is available, find the log for this specific branch
      if (branchId) {
        return logs.find(l => l.branchId === branchId) || null;
      }
      // Fallback for owner/all-branches view (returns first one found)
      return logs[0] || null;
    },
    [businessId, today, branchId]
  );

  const getExpectedCash = async () => {
    if (!currentLog || !businessId) return 0;

    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayEnd = new Date().setHours(23, 59, 59, 999);

    const todaySales = await db.sales
      .where('timestamp')
      .between(todayStart, todayEnd)
      .filter(s => s.branchId === currentLog.branchId)
      .toArray();

    const todayExpenses = await db.expenses
      .where('timestamp')
      .between(todayStart, todayEnd)
      .filter(e => e.status !== 'rejected' && e.branchId === currentLog.branchId)
      .toArray();

    const salesTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
    const expensesTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

    return currentLog.openingFloat + salesTotal - expensesTotal;
  };

  const openRegister = async (openingFloat: number) => {
    if (!businessId || !business) return;

    const deviceId = await getDeviceId();
    const id = await generateTraceableId('CASH', businessId, business.code, deviceId);
    
    const newLog: CashLog = {
      id,
      businessId,
      branchId: branchId || undefined,
      staffId: staff?.id || 'owner',
      date: today,
      openingFloat,
      expectedClosing: openingFloat,
      timestamp: Date.now(),
      status: 'open',
      syncStatus: 'pending'
    };

    await db.transaction('rw', db.cash_logs, db.sync_queue, db.counters, db.settings, async () => {
      await db.cash_logs.add(newLog);
      await db.sync_queue.add({
        id: await generateTraceableId('ORD', businessId, business.code, deviceId),
        action: 'INSERT',
        table: 'cash_logs',
        payload: newLog,
        timestamp: Date.now(),
        status: 'pending',
        errorCount: 0
      });
    });
  };

  const closeRegister = async (actualClosing: number) => {
    if (!currentLog || !business) return;

    const deviceId = await getDeviceId();
    const expectedClosing = await getExpectedCash();
    const discrepancy = actualClosing - expectedClosing;

    const update = {
      actualClosing,
      expectedClosing,
      discrepancy,
      status: 'closed' as const
    };

    await db.transaction('rw', db.cash_logs, db.sync_queue, db.counters, db.settings, async () => {
      await db.cash_logs.update(currentLog.id, update);
      await db.sync_queue.add({
        id: await generateTraceableId('ORD', businessId!, business.code, deviceId),
        action: 'UPDATE',
        table: 'cash_logs',
        payload: { ...currentLog, ...update },
        timestamp: Date.now(),
        status: 'pending',
        errorCount: 0
      });
    });
  };

  return {
    currentLog,
    isRegisterOpen: currentLog?.status === 'open',
    openRegister,
    closeRegister,
    getExpectedCash
  };
}
