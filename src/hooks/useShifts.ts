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
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'INSERT',
      table: 'shifts',
      payload: newShift,
      timestamp: Date.now(),
      status: 'pending',
      errorCount: 0
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
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'UPDATE',
      table: 'shifts',
      payload: updatedShift,
      timestamp: Date.now(),
      status: 'pending',
      errorCount: 0
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
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'UPDATE',
      table: 'shifts',
      payload: updatedShift,
      timestamp: Date.now(),
      status: 'pending',
      errorCount: 0
    });
  };

  return {
    activeShift,
    startShift,
    endShift,
    recordSaleToShift
  };
}
