import { useMemo, useState, useEffect } from 'react';
import { db } from '../db/db';
import { useAuth } from './useAuth';
import { useLiveQuery } from 'dexie-react-hooks';

export type SubscriptionStatus = 'active' | 'grace-period' | 'locked';

export interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

export function useSubscription() {
  const { business } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  // Update "now" every minute to keep calculations fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const statusInfo = useMemo(() => {
    if (!business) return { status: 'active' as SubscriptionStatus, daysLeft: 0, isTrial: false };

    const { expiryDate, packageId } = business;
    // const isActive = !!packageId;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    // If no package chosen, it's effectively "locked" until they pick a trial/plan
    if (!packageId) {
      return { status: 'locked' as SubscriptionStatus, daysLeft: 0, isTrial: false, needsDeposit: false };
    }

    if (now < expiryDate) {
      const diff = expiryDate - now;
      return {
        status: 'active' as SubscriptionStatus,
        daysLeft: Math.ceil(diff / (24 * 60 * 60 * 1000)),
        expiryDate,
        isTrial: true, // We treat the first 5 days as trial
        needsDeposit: false
      };
    } else if (now < expiryDate + threeDaysMs) {
      const diff = (expiryDate + threeDaysMs) - now;
      return {
        status: 'grace-period' as SubscriptionStatus,
        daysLeft: Math.ceil(diff / (24 * 60 * 60 * 1000)),
        expiryDate,
        isTrial: false,
        needsDeposit: true
      };
    } else {
      return {
        status: 'locked' as SubscriptionStatus,
        daysLeft: 0,
        expiryDate,
        isTrial: false,
        needsDeposit: true
      };
    }
  }, [business, now]);

  const packages = {
    hustler: { 
      name: 'Hustler Plan', 
      price: 500, 
      features: ['Basic POS', 'Offline Mode', 'Single User', 'Manual Reports'] 
    },
    biashara: { 
      name: 'Biashara Plan', 
      price: 1500, 
      features: ['Inventory Alerts', 'Multi-staff', 'Daily Analytics', 'Receipt Printing'] 
    },
    boss: { 
      name: 'Boss Plan', 
      price: 3500, 
      features: ['Pro Analytics', 'Multi-branch Sync', 'Custom Features', 'Priority Support'] 
    }
  };

  const staffCount = useLiveQuery(() => 
    business?.id ? db.staff.where('businessId').equals(business.id).count() : 0, 
    [business?.id]
  ) || 0;

  // Extra staff cost (Owner is free, staff 150/mo each)
  const staffCost = staffCount * 150;

  // Custom features added by engineer (KES 200/mo each)
  const customFeaturesCost = (business?.customFeatureCount || 0) * 200;

  return { 
    ...statusInfo, 
    packages, 
    staffCount, 
    staffCost, 
    customFeaturesCost,
    totalMonthly: (business?.packageId ? packages[business.packageId as keyof typeof packages]?.price || 0 : 0) + staffCost + customFeaturesCost
  };
}
