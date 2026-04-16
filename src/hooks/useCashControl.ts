import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { db, type CashLog } from '../db/db';
import { useAuth } from './useAuth';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { playBeep } from '../utils/audio';

export function useCashControl() {
  const { businessId, business, branchId, staff } = useAuth();
  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const today = getLocalDateString();

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

  const expectedCash = useLiveQuery(
    async () => {
      if (!currentLog || !businessId) return 0;
      const shiftStartTimestamp = currentLog.timestamp;
      const now = Date.now();

      const todaySales = await db.sales
        .where('timestamp')
        .between(shiftStartTimestamp, now)
        .filter(s => s.status !== 'voided' && s.branchId === currentLog.branchId)
        .toArray();

      const todayExpenses = await db.expenses
        .where('timestamp')
        .between(shiftStartTimestamp, now)
        .filter(e => e.status !== 'rejected' && e.branchId === currentLog.branchId)
        .toArray();

      const salesTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
      const expensesTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

      return currentLog.openingFloat + salesTotal - expensesTotal;
    },
    [currentLog, businessId]
  ) || 0;

  const getExpectedCash = async () => expectedCash;

  const openRegister = async (openingFloat: number) => {
    if (!businessId || !business) return;

    const deviceId = await getDeviceId();
    const id = await generateTraceableId('CASH', businessId, business?.code, deviceId);
    
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

    await db.transaction('rw', [db.cash_logs, db.pos_events, db.counters, db.settings], async () => {
      await db.cash_logs.add(newLog);
      
      const payload = newLog;
      const eventHash = await generateEventHash(payload);

      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: staff?.id || 'owner',
        event_type: 'CASH_REGISTER_OPENED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
      playBeep();
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

    await db.transaction('rw', [db.cash_logs, db.pos_events, db.counters, db.settings], async () => {
      await db.cash_logs.update(currentLog.id, update);
      
      const payload = { ...currentLog, ...update };
      const eventHash = await generateEventHash(payload);

      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId!, business?.code, deviceId),
        business_id: businessId!,
        staff_id: currentLog.staffId,
        event_type: 'CASH_REGISTER_CLOSED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
      playBeep();
    });
  };

  const getZReportData = useCallback(async () => {
    if (!businessId) return null;

    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayEnd = new Date().setHours(23, 59, 59, 999);

    // 1. Fetch relevant logs and stats
    // Logic: If user is staff, filter by branch. If owner, get ALL.
    const branchFilter = branchId || undefined;

    const salesQuery = db.sales.where('[businessId+timestamp]').between([businessId, todayStart], [businessId, todayEnd]);
    const expensesQuery = db.expenses.where('[businessId+timestamp]').between([businessId, todayStart], [businessId, todayEnd]);

    let todaySales = await salesQuery.toArray();
    let todayExpenses = await expensesQuery.toArray();

    // Secondary Filter: Data Parity across devices/branches
    if (branchFilter) {
      todaySales = todaySales.filter(s => s.branchId === branchFilter && s.status !== 'voided');
      todayExpenses = todayExpenses.filter(e => e.branchId === branchFilter && e.status !== 'rejected');
    } else {
      todaySales = todaySales.filter(s => s.status !== 'voided');
      todayExpenses = todayExpenses.filter(e => e.status !== 'rejected');
    }

    const cashSales = todaySales
      .filter(s => s.paymentMethod === 'Cash')
      .reduce((sum, s) => sum + s.total, 0);
    
    const splitCash = todaySales
      .filter(s => s.paymentMethod === 'Split')
      .reduce((sum, s) => {
        const cashPart = s.splitPayments?.find(p => p.method === 'Cash')?.amount || 0;
        return sum + cashPart;
      }, 0);

    const mpesaSales = todaySales
      .filter(s => s.paymentMethod === 'M-Pesa')
      .reduce((sum, s) => sum + s.total, 0) +
      todaySales
      .filter(s => s.paymentMethod === 'Split')
      .reduce((sum, s) => {
        const mpesaPart = s.splitPayments?.find(p => p.method === 'M-Pesa')?.amount || 0;
        return sum + mpesaPart;
      }, 0);

    const expensesTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalCashCollected = cashSales + splitCash;

    // For Register expected cash, we still need the the opening float of the CURRENT device/branch register
    const openingFloat = currentLog?.openingFloat || 0;
    const expectedCashInDrawer = openingFloat + totalCashCollected - expensesTotal;

    return {
      openingFloat,
      cashSales: totalCashCollected,
      mpesaSales,
      expenses: expensesTotal,
      expectedCash: expectedCashInDrawer,
      salesCount: todaySales.length,
      expensesCount: todayExpenses.length
    };
  }, [businessId, branchId, currentLog?.openingFloat]);

  return {
    currentLog,
    isRegisterOpen: currentLog?.status === 'open',
    isLoadingLog: currentLog === undefined,
    openRegister,
    closeRegister,
    getExpectedCash,
    getZReportData,
    expectedCash
  };
}
