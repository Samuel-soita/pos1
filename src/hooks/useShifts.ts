import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Shift } from '../db/db';
import { useAuth } from './useAuth';
import { v4 as uuidv4 } from 'uuid';

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
    // Sync
    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: businessId,
      staff_id: staffId,
      event_type: 'SHIFT_STARTED',
      payload: newShift,
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: 'MOCK_HASH',
      sync_status: 'pending'
    });

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

    // Sync
    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: activeShift.businessId,
      staff_id: activeShift.staffId,
      event_type: 'SHIFT_ENDED',
      payload: updatedShift,
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: 'MOCK_HASH',
      sync_status: 'pending'
    });
  };

  const recordSaleToShift = async (amount: number, method: string) => {
    if (!activeShift) return;

    const updatedShift: Shift = {
      ...activeShift,
      totalSales: activeShift.totalSales + amount,
      cashSales: method === 'Cash' ? activeShift.cashSales + amount : activeShift.cashSales,
      mpesaSales: method === 'M-Pesa' ? activeShift.mpesaSales + amount : activeShift.mpesaSales,
    };

    await db.shifts.put(updatedShift);
    // Sync update
    await db.pos_events.add({
      event_id: uuidv4(),
      business_id: activeShift.businessId,
      staff_id: activeShift.staffId,
      event_type: 'SHIFT_UPDATED',
      payload: updatedShift,
      client_timestamp: Date.now(),
      server_timestamp: 0,
      hash: 'MOCK_HASH',
      sync_status: 'pending'
    });
  };

  return {
    activeShift,
    startShift,
    endShift,
    recordSaleToShift
  };
}
