import { useMemo } from 'react';
import { db } from '../db/db';
import { useAuth } from './useAuth';
import { useLiveQuery } from 'dexie-react-hooks';

export type TimeWindow = 'day' | 'week' | 'month' | 'quarter' | '6months' | 'year';

export function useReports(timeWindow: TimeWindow, branchFilter?: string) {
  const { businessId, branchId: userBranchId, userType } = useAuth();
  
  const queryResult = useLiveQuery(() => {
    if (!businessId) return [];
    return db.sales.where('businessId').equals(businessId).toArray();
  }, [businessId]);

  const rawExpenses = useLiveQuery(() => {
    if (!businessId) return [];
    return db.expenses.where('businessId').equals(businessId).toArray();
  }, [businessId]);

  const rawStaffList = useLiveQuery(() => {
    if (!businessId) return [];
    return db.staff.where('businessId').equals(businessId).toArray();
  }, [businessId]);

  const { sales, totalSales, totalProfit, totalExpenses, netProfit, topProducts, trends, staffPerformance } = useMemo(() => {
    const allSales = queryResult || [];
    const allExpenses = rawExpenses || [];
    const staff = rawStaffList || [];
    const now = new Date();
    // Default to start of today for 'day'
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeWindow) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case '6months':
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const startTimestamp = startDate.getTime();

    // Filter sales by time window and branch
    const filteredSales = allSales.filter(sale => {
      const matchesTime = sale.timestamp >= startTimestamp;
      const effectiveBranchFilter = userType === 'staff' ? userBranchId : (branchFilter || null);
      const matchesBranch = !effectiveBranchFilter || sale.branchId === effectiveBranchFilter;
      return matchesTime && matchesBranch;
    });

    // Filter expenses by time window and branch
    const filteredExpenses = allExpenses.filter(exp => {
      const matchesTime = exp.timestamp >= startTimestamp;
      const effectiveBranchFilter = userType === 'staff' ? userBranchId : (branchFilter || null);
      const matchesBranch = !effectiveBranchFilter || exp.branchId === effectiveBranchFilter;
      // Only subtract 'verified' expenses
      return matchesTime && matchesBranch && exp.status !== 'pending';
    });

    // Calculate totals
    const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const grossProfit = filteredSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const netProfit = grossProfit - totalExpenses;

    // Aggregate products for "Top Products"
    const productCounts: Record<string, { name: string; quantity: number; revenue: number }> = {};
    const staffPerformanceMap: Record<string, { name: string; salesCount: number; revenue: number }> = {};
    
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        if (!productCounts[item.productId]) {
          productCounts[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
        }
        productCounts[item.productId].quantity += item.quantity;
        productCounts[item.productId].revenue += (item.price * item.quantity);
      });

      const sId = sale.staffId || 'Owner';
      if (!staffPerformanceMap[sId]) {
        const staffObj = staff.find(s => s.id === sId);
        staffPerformanceMap[sId] = { 
          name: staffObj ? `${staffObj.firstName} ${staffObj.lastName}` : 'Direct/Owner',
          salesCount: 0, 
          revenue: 0 
        };
      }
      staffPerformanceMap[sId].salesCount += 1;
      staffPerformanceMap[sId].revenue += sale.total;
    });

    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const staffPerformance = Object.values(staffPerformanceMap)
      .sort((a, b) => b.revenue - a.revenue);

    // Trend Calculations
    const todaySales = allSales.filter(s => s.timestamp >= startTimestamp);
    const todayProfit = todaySales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
    
    return {
      sales: filteredSales.sort((a, b) => b.timestamp - a.timestamp),
      totalSales,
      totalProfit: grossProfit,
      totalExpenses,
      netProfit,
      topProducts,
      staffPerformance,
      trends: {
        todayProfit,
        yesterdayProfit: 0, // Simplified for now
        yesterdaySales: 0,
        trendPercentage: 0
      }
    };
  }, [queryResult, rawExpenses, rawStaffList, timeWindow, branchFilter, userBranchId, userType]);

  return {
    sales,
    totalSales,
    totalProfit,
    totalExpenses,
    netProfit,
    topProducts,
    staffPerformance,
    trends,
  };
}
