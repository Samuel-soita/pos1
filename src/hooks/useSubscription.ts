import { useMemo, useState, useEffect } from 'react';
import { db } from '../db/db';
import { useAuth } from './useAuth';
import { useLiveQuery } from 'dexie-react-hooks';

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'pending_payment' | 'suspended';

export interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

export const MODULAR_FEATURES = {
  inventory_alerts: { id: 'inventory_alerts', name: 'Inventory Alerts', price: 200, icon: 'Package', desc: 'Low stock alerts & automated reorder lists' },
  branch_management: { id: 'branch_management', name: 'Branch Management', price: 500, icon: 'GitMerge', desc: 'Multi-branch sync & central inventory control' },
  shift_tracking: { id: 'shift_tracking', name: 'Shift Tracking', price: 300, icon: 'Clock', desc: 'Track staff clock-in/out & register handovers' },
  advanced_analytics: { id: 'advanced_analytics', name: 'Advanced Analytics', price: 600, icon: 'BarChart3', desc: 'Deep profit analysis & custom forecast reports' },
  excel_exports: { id: 'excel_exports', name: 'Full Excel Exports', price: 400, icon: 'Download', desc: 'Unlimited data exports for external bookkeeping' },
  receipt_customization: { id: 'receipt_customization', name: 'Pro Receipt Header', price: 200, icon: 'Printer', desc: 'Add complex logos & custom footers to receipts' }
};

export function useSubscription() {
  const { business } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  // Phase 4 Hardening: Prevent basic local clock drift abuse by syncing with verified entitlement tokens
  useEffect(() => {
    const timer = setInterval(() => {
      let authoritativeNow = Date.now();
      try {
        const entitlementStr = localStorage.getItem(`entitlement_${business?.id}`);
        if (entitlementStr) {
          const payload = JSON.parse(atob(entitlementStr.split('.')[1]));
          if (payload.server_now) {
            authoritativeNow = Math.max(Date.now(), payload.server_now);
          }
        }
      } catch {
        // ignore
      }
      setNow(authoritativeNow);
    }, 60000);
    return () => clearInterval(timer);
  }, [business?.id]);

  const statusInfo = useMemo(() => {
    if (!business) return { status: 'active' as SubscriptionStatus, daysLeft: 0, message: '', isLocked: false, isTrial: false, limitReached: false, trialUsed: false };

    const { expiryDate, status: businessStatus, suspendedRevenueCount = 0, trialUsed = false } = business;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const isTrial = businessStatus === 'trial';

    // 1. Pending Payment Flow (Trust-First)
    if (businessStatus === 'pending_payment') {
      return {
        status: 'pending_payment' as SubscriptionStatus,
        message: 'Payment detected, confirming...',
        isLocked: false,
        daysLeft: 0,
        isTrial: false,
        limitReached: false
      };
    }

    // 2. Trial & Active Flow
    if (now < expiryDate) {
      const diff = expiryDate - now;
      const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
      return {
        status: isTrial ? 'trial' : 'active' as SubscriptionStatus,
        daysLeft: days,
        message: isTrial ? `Trial ends in ${days} days` : `Subscription active: ${days} days left`,
        isLocked: false,
        isTrial,
        limitReached: false,
        trialUsed
      };
    }

    // 3. Grace Period Flow (3 Days)
    if (now < expiryDate + threeDaysMs) {
      const diff = (expiryDate + threeDaysMs) - now;
      const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
      return {
        status: 'grace' as SubscriptionStatus,
        daysLeft: days,
        message: `Grace period: ${days} days remaining`,
        isLocked: false,
        isTrial: false,
        limitReached: false
      };
    }

    // 4. Suspended Flow (Smart Lock - 20 Sales)
    const limitReached = suspendedRevenueCount >= 20;
    return {
      status: 'suspended' as SubscriptionStatus,
      daysLeft: 0,
      message: limitReached ? 'Emergency sales limit reached' : `Suspended: ${20 - suspendedRevenueCount} emergency sales left`,
      isLocked: limitReached,
      isTrial: false,
      limitReached,
      trialUsed
    };
  }, [business, now]);

  const packages = {
    hustler: { 
      id: 'hustler',
      name: 'Hustler Solo', 
      price: 600, 
      features: ['Basic POS', 'Offline Mode', 'Single Device', 'Thermal Receipts'] 
    },
    growth: { 
      id: 'growth',
      name: 'Growth Business', 
      price: 1500, 
      features: ['Inventory Alerts', 'Branch Management', 'Shift Tracking', 'Bulk Stock Import'] 
    },
    max: { 
      id: 'max',
      name: 'Max Enterprise', 
      price: 3500, 
      features: ['Advanced Analytics', 'Unlimited Devices', 'Priority Support', 'Full Excel Exports'] 
    },
    custom: {
      id: 'custom',
      name: 'Custom Build',
      price: 0,
      features: []
    }
  };

  const staffCount = useLiveQuery(() => 
    business?.id ? db.staff.where('businessId').equals(business.id).count() : 0, 
    [business?.id]
  ) || 0;

  // Extra staff cost (Owner is free, staff 150/mo each)
  const staffCost = staffCount * 150;

  // Custom features added by engineer (Legacy count mechanism)
  const legacyCustomCost = (business?.customFeatureCount || 0) * 200;

  // New Modular Features Cost
  const enabledFeatures = business?.enabledFeatures || [];
  const modularCost = enabledFeatures.reduce((acc, featId) => {
    const feat = MODULAR_FEATURES[featId as keyof typeof MODULAR_FEATURES];
    return acc + (feat?.price || 0);
  }, 0);

  const toggleFeature = async (featureId: string) => {
    if (!business) return;
    const current = business.enabledFeatures || [];
    const updated = current.includes(featureId) 
      ? current.filter(id => id !== featureId)
      : [...current, featureId];
    await db.businesses.update(business.id, { enabledFeatures: updated });
  };

  const updatePlan = async (packageId: string, features?: string[]) => {
    if (!business) return;
    await db.businesses.update(business.id, { 
      packageId, 
      enabledFeatures: features ?? business.enabledFeatures 
    });
  };

  const totalMonthly = (business?.packageId ? (packages as Record<string, Plan>)[business.packageId]?.price || 0 : 0) + 
                       staffCost + legacyCustomCost + modularCost;

  return { 
    ...statusInfo, 
    packages, 
    staffCount, 
    staffCost, 
    modularCost,
    totalMonthly,
    toggleFeature,
    updatePlan,
    enabledFeatures
  };
}
