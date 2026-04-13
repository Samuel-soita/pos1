import { db } from '../db/db';

/**
 * Generates a Conflict-Free, Multi-Tenant Traceable ID
 * Format: TYPE-BIZCODE-DEV-SALT-SEQUENCE
 * Example: ORD-0001-DEV-A1B2-X9F-1024
 */
export async function generateTraceableId(
  type: 'ORD' | 'EXP' | 'PRD' | 'STF' | 'SHIFT' | 'BRH' | 'CASH' | 'INV' | 'LED' | 'EVT' | 'SUP' | 'PUR' | 'SYS',
  businessId: string,
  businessCode: string,
  deviceId: string
): Promise<string> {
  const counterId = `${businessId}_${type}`;
  
  // 1. Get and update local counter
  let counter = await db.counters.get(counterId);
  if (!counter) {
    counter = { id: counterId, businessId, entityType: type, count: 0 };
    await db.counters.add(counter);
  }
  
  const nextCount = counter.count + 1;
  await db.counters.update(counterId, { count: nextCount });

  // 2. Generate 3-char random salt to prevent collisions if counter resets
  const salt = Math.random().toString(36).substring(2, 5).toUpperCase();
  
  // 3. Format the sequence (pad with leading zeros)
  const sequence = nextCount.toString().padStart(4, '0');
  
  // 4. Extract short Device ID for compact IDs
  const shortDevId = deviceId.includes('-') ? deviceId.split('-')[1] : deviceId.substring(0, 4);

  return `${type}-${businessCode}-${shortDevId}-${salt}-${sequence}`;
}

export async function getDeviceId(): Promise<string> {
  const setting = await db.settings.get('device_id');
  return (setting?.value as string) || 'UNKNOWN';
}
