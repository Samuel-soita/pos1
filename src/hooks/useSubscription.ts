import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useMemo, useEffect, useState } from 'react';

export type SubscriptionStatus = 'active' | 'grace-period' | 'locked';

export function useSubscription() {
  const settingsRaw = useLiveQuery(() => db.settings.toArray()) || [];
  
  // Convert settings array to highly accessible object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRaw.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as any);

  // Time-hardening: Prevent clock tampering by applying the server offset if synced
  // Removed secureTimeNow block as it is moved inline for less confusion

  // Initialize defaults if not present
  useEffect(() => {
    async function init() {
      const expiry = await db.settings.get('expiry_date');
      if (!expiry) {
        // Default to a 14-day trial for new devices
        const defaultExpiry = Date.now() + 14 * 24 * 60 * 60 * 1000;
        await db.settings.put({ key: 'expiry_date', value: defaultExpiry });
      }
      
      const businessName = await db.settings.get('business_name');
      if (!businessName) {
        await db.settings.put({ key: 'business_name', value: 'My Hardware Store' });
      }
      
      const deviceId = await db.settings.get('device_id');
      if (!deviceId) {
        await db.settings.put({ key: 'device_id', value: `POS-${Math.random().toString(36).substr(2, 9).toUpperCase()}` });
      }
    }
    init();
  }, []);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const statusInfo = useMemo(() => {
    if (!settings || Object.keys(settings).length === 0) return { status: 'active' as SubscriptionStatus, daysLeft: 14 };

    const expiryDate = settings['expiry_date'];
    if (!expiryDate) return { status: 'active' as SubscriptionStatus, daysLeft: 30 };
    
    const offset = settings['time_offset'] || 0;
    const secureNow = now + offset;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    if (secureNow < expiryDate) {
      const diff = expiryDate - secureNow;
      return {
        status: 'active' as SubscriptionStatus,
        daysLeft: Math.ceil(diff / (24 * 60 * 60 * 1000)),
        expiryDate
      };
    } else if (secureNow < expiryDate + threeDaysMs) {
      const diff = (expiryDate + threeDaysMs) - secureNow;
      return {
        status: 'grace-period' as SubscriptionStatus,
        daysLeft: Math.ceil(diff / (24 * 60 * 60 * 1000)),
        expiryDate
      };
    } else {
      return {
        status: 'locked' as SubscriptionStatus,
        daysLeft: 0,
        expiryDate
      };
    }
  }, [settings, now]);

  return statusInfo;
}
