import { useMemo, useState, useEffect } from 'react';
import { db } from '../db/db';
import { useAuth } from './useAuth';
import { useLiveQuery } from 'dexie-react-hooks';

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'pending_payment' | 'suspended' | 'pending_verification';

export interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

export const MODULAR_FEATURES = {
  inventory_alerts: { id: 'inventory_alerts', name: 'Inventory Alerts', price: 100, icon: 'Package', desc: 'Low stock alerts & automated reorder lists' },
  branch_management: { id: 'branch_management', name: 'Branch Management', price: 200, icon: 'GitMerge', desc: 'Multi-branch sync & central inventory control' },
  shift_tracking: { id: 'shift_tracking', name: 'Shift Tracking', price: 150, icon: 'Clock', desc: 'Track staff clock-in/out & register handovers' },
  advanced_analytics: { id: 'advanced_analytics', name: 'Advanced Analytics', price: 250, icon: 'BarChart3', desc: 'Deep profit analysis & custom forecast reports' },
  excel_exports: { id: 'excel_exports', name: 'Full Excel Exports', price: 150, icon: 'Download', desc: 'Unlimited data exports for external bookkeeping' },
  receipt_customization: { id: 'receipt_customization', name: 'Pro Receipt Header', price: 100, icon: 'Printer', desc: 'Add complex logos & custom footers to receipts' }
};

export function useSubscription() {
  const { business } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  // Phase 4 Hardening: Monotonic Time Protection (Anti-fraud)
  const lastSeenTime = useLiveQuery(async () => {
    const setting = await db.settings.get('latest_observed_time');
    return (setting?.value as number) || 0;
  }, []) || 0;

  useEffect(() => {
    const timer = setInterval(async () => {
      const localNow = Date.now();
      const lastSyncTimeStr = localStorage.getItem(`entitlement_${business?.id}_last_sync`);
      const lastSyncTime = lastSyncTimeStr ? parseInt(lastSyncTimeStr, 10) : 0;
      
      // High-Water Mark: Time can only move FORWARD
      const authoritativeNow = Math.max(localNow, lastSyncTime, lastSeenTime);
      
      if (authoritativeNow > lastSeenTime) {
        await db.settings.put({ key: 'latest_observed_time', value: authoritativeNow });
      }
      
      setNow(authoritativeNow);
    }, 10000); // Check every 10 seconds
    return () => clearInterval(timer);
  }, [business?.id, lastSeenTime]);

  const lastSyncTimeStr = localStorage.getItem(`entitlement_${business?.id}_last_sync`);
  const lastSyncTime = lastSyncTimeStr ? parseInt(lastSyncTimeStr, 10) : 0;
  const isLimitedMode = lastSyncTime === 0 || (now - lastSyncTime > 1 * 24 * 60 * 60 * 1000); // Tightened to 1 day

  const statusInfo = useMemo(() => {
    if (!business) return { status: 'active' as SubscriptionStatus, daysLeft: 0, message: '', isLocked: false, isTrial: false, limitReached: false, trialUsed: false, isLimitedMode: false };

    const { expiryDate, status: businessStatus, suspendedRevenueCount = 0, trialUsed = false } = business;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const isTrial = businessStatus === 'trial';

    const limitCondition = isLimitedMode ? suspendedRevenueCount >= 7 : suspendedRevenueCount >= 5; // 7 for blackout, 5 for online

    // 1. Pending Payment Flow (Trust-First)
    if (businessStatus === 'pending_payment' || businessStatus === 'pending_verification') {
      return {
        status: businessStatus as SubscriptionStatus,
        message: businessStatus === 'pending_verification' 
          ? 'Payment under review (1–5 mins)...' 
          : 'Payment detected, confirming...',
        isLocked: limitCondition,
        daysLeft: 0,
        isTrial: false,
        limitReached: limitCondition,
        trialUsed,
        isLimitedMode
      };
    }

    // 2. Trial & Active Flow
    if (now < expiryDate) {
      const diff = expiryDate - now;
      const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
      return {
        status: isTrial ? 'trial' : 'active' as SubscriptionStatus,
        daysLeft: days,
        message: isLimitedMode
            ? `Limited Mode: Connect to internet. ${20 - suspendedRevenueCount} offline sales left`
            : (isTrial ? `Trial ends in ${days} days` : `Subscription active: ${days} days left`),
        isLocked: isLimitedMode && limitCondition,
        isTrial,
        limitReached: isLimitedMode && limitCondition,
        trialUsed,
        isLimitedMode
      };
    }

    // 3. Grace Period Flow (3 Days) - Only for active subscriptions, not trials
    if (!isTrial && now < expiryDate + threeDaysMs) {
      const diff = (expiryDate + threeDaysMs) - now;
      const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
      return {
        status: 'grace' as SubscriptionStatus,
        daysLeft: days,
        message: isLimitedMode
          ? `Limited Mode: Connect to internet. ${20 - suspendedRevenueCount} offline sales left`
          : `Grace period: ${days} days remaining`,
        isLocked: isLimitedMode && limitCondition,
        isTrial: false,
        limitReached: isLimitedMode && limitCondition,
        trialUsed,
        isLimitedMode
      };
    }

    // 4. Suspended Flow
    const limitReached = limitCondition;
    return {
      status: 'suspended' as SubscriptionStatus,
      daysLeft: 0,
      message: limitReached ? 'Emergency sales limit reached. Sync required.' : `Suspended: ${isLimitedMode ? 7 - suspendedRevenueCount : 5 - suspendedRevenueCount} emergency sales left`,
      isLocked: limitReached,
      isTrial: false,
      limitReached,
      trialUsed,
      isLimitedMode
    };
  }, [business, now, isLimitedMode]);

  const packages = {
    hustler: { 
      id: 'hustler',
      name: 'Hustler Solo', 
      price: 499, 
      features: ['Basic POS', 'Offline Mode', 'Single Device', 'Thermal Receipts'] 
    },
    growth: { 
      id: 'growth',
      name: 'Growth Business', 
      price: 599, 
      features: ['Inventory Alerts', 'Branch Management', 'Shift Tracking', 'Bulk Stock Import'] 
    },
    max: { 
      id: 'max',
      name: 'Max Enterprise', 
      price: 699, 
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

  // Extra staff cost (Owner is free, staff 100/mo each)
  const staffCost = staffCount * 100;

  // Custom features added by engineer (Legacy count mechanism)
  const legacyCustomCost = (business?.customFeatureCount || 0) * 200;

  // New Modular Features Cost (Capped at 1000 for custom builds)
  const enabledFeatures = business?.enabledFeatures || [];
  const rawModularCost = enabledFeatures.reduce((acc, featId) => {
    const feat = MODULAR_FEATURES[featId as keyof typeof MODULAR_FEATURES];
    return acc + (feat?.price || 0);
  }, 0);
  const modularCost = business?.packageId === 'custom' ? Math.min(rawModularCost, 1000) : rawModularCost;

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
