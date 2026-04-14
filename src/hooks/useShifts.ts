import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Shift } from '../db/db';
import { useAuth } from './useAuth';
import { v4 as uuidv4 } from 'uuid';
import { generateEventHash } from '../utils/hashUtils';
import { playBeep } from '../utils/audio';

export function useShifts() {
  const { staffId, businessId } = useAuth();

  const activeShift = useLiveQuery(async () => {
    if (!staffId || !businessId) return null;
    return await db.shifts
      .where({ staffId, businessId, status: 'active' })
      .first();
  }, [staffId, businessId]);

  const startShift = async () => {
    if (!staffId || !businessId) return;
    
    // Check if already has active shift
    const existing = await db.shifts
      .where({ staffId, businessId, status: 'active' })
      .first();
      
    if (existing) return existing.id;

    const newShift: Shift = {
      id: uuidv4(),
      businessId,
      staffId,
      startTime: Date.now(),
      totalSales: 0,
      cashSales: 0,
      mpesaSales: 0,
      status: 'active',
      syncStatus: 'pending'
    };

    await db.shifts.add(newShift);
    
    const payload = newShift;
    const eventHash = await generateEventHash(payload);

    // Sync
    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: businessId,
      staff_id: staffId,
      event_type: 'SHIFT_STARTED',
      payload,
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
    playBeep();

    return newShift.id;
  };

  const endShift = async () => {
    if (!activeShift) return;

    const updatedShift: Shift = {
      ...activeShift,
      endTime: Date.now(),
      status: 'completed'
    };

    await db.shifts.put(updatedShift);

    const payload = updatedShift;
    const eventHash = await generateEventHash(payload);

    // Sync
    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: activeShift.businessId,
      staff_id: activeShift.staffId,
      event_type: 'SHIFT_ENDED',
      payload,
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
    playBeep();
  };

  const recordSaleToShift = async (amount: number, method: string, splitPayments?: { method: string; amount: number }[]) => {
    if (!activeShift) return;

    let cashDelta = 0;
    let mpesaDelta = 0;

    if (method === 'Split' && splitPayments) {
      splitPayments.forEach(p => {
        if (p.method === 'Cash') cashDelta += p.amount;
        if (p.method === 'M-Pesa') mpesaDelta += p.amount;
      });
    } else {
      if (method === 'Cash') cashDelta = amount;
      if (method === 'M-Pesa') mpesaDelta = amount;
    }

    const updatedShift: Shift = {
      ...activeShift,
      totalSales: Math.round((activeShift.totalSales + amount) * 100) / 100,
      cashSales: Math.round((activeShift.cashSales + cashDelta) * 100) / 100,
      mpesaSales: Math.round((activeShift.mpesaSales + mpesaDelta) * 100) / 100,
    };

    await db.shifts.put(updatedShift);
    
    const payload = updatedShift;
    const eventHash = await generateEventHash(payload);

    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: activeShift.businessId,
      staff_id: activeShift.staffId,
      event_type: 'SHIFT_UPDATED',
      payload,
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
  };

  const recordVoidToShift = async (amount: number, method: string, splitPayments?: { method: string; amount: number }[]) => {
    if (!activeShift) return;

    let cashDelta = 0;
    let mpesaDelta = 0;

    if (method === 'Split' && splitPayments) {
      splitPayments.forEach(p => {
        if (p.method === 'Cash') cashDelta += p.amount;
        if (p.method === 'M-Pesa') mpesaDelta += p.amount;
      });
    } else {
      if (method === 'Cash') cashDelta = amount;
      if (method === 'M-Pesa') mpesaDelta = amount;
    }

    const updatedShift: Shift = {
      ...activeShift,
      totalSales: Math.round((activeShift.totalSales - amount) * 100) / 100,
      cashSales: Math.round((activeShift.cashSales - cashDelta) * 100) / 100,
      mpesaSales: Math.round((activeShift.mpesaSales - mpesaDelta) * 100) / 100,
    };

    await db.shifts.put(updatedShift);
    
    const payload = updatedShift;
    const eventHash = await generateEventHash(payload);

    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: activeShift.businessId,
      staff_id: activeShift.staffId,
      event_type: 'SHIFT_UPDATED',
      payload,
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
  };

  return {
    activeShift,
    startShift,
    endShift,
    recordSaleToShift,
    recordVoidToShift
  };
}
