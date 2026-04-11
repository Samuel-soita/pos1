import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useAuth } from './useAuth';

export interface AppNotification {
  id: string;
  type: 'low_stock' | 'pending_expense' | 'rejected_expense' | 'info';
  title: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
  actionLabel?: string;
  actionTab?: string;
}

export function useNotifications() {
  const { userType, businessId } = useAuth();
  const isOwner = userType === 'owner';

  const notifications = useLiveQuery(async () => {
    if (!businessId) return [];
    const alerts: AppNotification[] = [];

    // 1. Low Stock Check
    const products = await db.products.where('businessId').equals(businessId).toArray();
    const lowStock = products.filter(p => p.quantity <= (p.lowStockThreshold || 5));
    if (lowStock.length > 0) {
      alerts.push({
        id: 'low-stock-alert',
        type: 'low_stock',
        title: 'Low Stock Alert',
        message: `${lowStock.length} items are running low.`,
        severity: 'warning',
        actionLabel: 'Check Inventory',
        actionTab: 'inventory'
      });
    }

    // 2. Pending Verification (Owner Only)
    if (isOwner) {
      const pendingExpenses = await db.expenses
        .where('status')
        .equals('pending')
        .count();
      
      if (pendingExpenses > 0) {
        alerts.push({
          id: 'pending-verify-alert',
          type: 'pending_expense',
          title: 'Unverified Expenses',
          message: `There are ${pendingExpenses} expenses waiting for your approval.`,
          severity: 'info',
          actionLabel: 'Verify Now',
          actionTab: 'expenses'
        });
      }
    }

    // 3. Rejected Expenses (Staff Only)
    if (!isOwner) {
      const rejectedExpenses = await db.expenses
        .where('status')
        .equals('rejected')
        .count();
      
      if (rejectedExpenses > 0) {
        alerts.push({
          id: 'rejected-expense-alert',
          type: 'rejected_expense',
          title: 'Expenses Rejected',
          message: `${rejectedExpenses} of your logged expenses were rejected.`,
          severity: 'error',
          actionLabel: 'Review Expenses',
          actionTab: 'expenses'
        });
      }
    }

    return alerts;
  }, [businessId, isOwner]) || [];

  return {
    notifications,
    hasAlerts: notifications.length > 0,
    severity: notifications.some(n => n.severity === 'error') ? 'error' : 
              notifications.some(n => n.severity === 'warning') ? 'warning' : 'info'
  };
}
