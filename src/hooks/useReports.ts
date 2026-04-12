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

  const rawStaffList = useLiveQuery(() => {
    if (!businessId) return [];
    return db.staff.where('businessId').equals(businessId).toArray();
  }, [businessId]);

  const { sales, totalSales, totalProfit, topProducts, trends, staffPerformance } = useMemo(() => {
    const allSales = queryResult || [];
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
      
      // Scoping logic
      const effectiveBranchFilter = userType === 'staff' ? userBranchId : (branchFilter || null);
      const matchesBranch = !effectiveBranchFilter || sale.branchId === effectiveBranchFilter;
      
      return matchesTime && matchesBranch;
    });

    // Calculate totals
    const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const totalProfit = filteredSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);

    // Aggregate products for "Top Products"
    const productCounts: Record<string, { name: string; quantity: number; revenue: number }> = {};
    const staffPerformanceMap: Record<string, { name: string; firstName: string; lastName: string; salesCount: number; revenue: number }> = {};
    
    filteredSales.forEach(sale => {
      // Product aggregation
      sale.items.forEach(item => {
        if (!productCounts[item.productId]) {
          productCounts[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
        }
        productCounts[item.productId].quantity += item.quantity;
        productCounts[item.productId].revenue += (item.price * item.quantity);
      });

      // Staff aggregation
      const sId = sale.staffId || 'Owner';
      if (!staffPerformanceMap[sId]) {
        const staffObj = staff.find(s => s.id === sId);
        staffPerformanceMap[sId] = { 
          name: staffObj ? `${staffObj.firstName} ${staffObj.lastName}` : 'Direct/Owner',
          firstName: staffObj?.firstName || 'Owner',
          lastName: staffObj?.lastName || '',
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

    // --- Trend Calculations ---
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
    const endOfYesterday = startOfToday - 1;

    const todaySales = allSales.filter(s => s.timestamp >= startOfToday);
    const yesterdaySales = allSales.filter(s => s.timestamp >= startOfYesterday && s.timestamp <= endOfYesterday);
    const yesterdaySalesSum = yesterdaySales.reduce((sum, s) => sum + s.total, 0);

    const todayProfit = todaySales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
    const yesterdayProfit = yesterdaySales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);

    let trendPercentage = 0;
    if (yesterdayProfit > 0) {
      trendPercentage = ((todayProfit - yesterdayProfit) / yesterdayProfit) * 100;
    } else if (todayProfit > 0) {
      trendPercentage = 100; // Flat 100% gain if yesterday was zero
    }

    return {
      sales: filteredSales.sort((a, b) => b.timestamp - a.timestamp), // latest first
      totalSales,
      totalProfit,
      topProducts,
      staffPerformance,
      trends: {
        todayProfit,
        yesterdayProfit,
        yesterdaySales: yesterdaySalesSum,
        trendPercentage
      }
    };
  }, [queryResult, rawStaffList, timeWindow, branchFilter, userBranchId, userType]);

  return {
    sales,
    totalSales,
    totalProfit,
    topProducts,
    staffPerformance,
    trends,
  };
}
