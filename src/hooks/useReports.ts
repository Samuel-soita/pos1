import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export type TimeWindow = 'day' | 'week' | 'month' | 'quarter' | '6months' | 'year';

export function useReports(timeWindow: TimeWindow) {
  const queryResult = useLiveQuery(() => db.sales.toArray());

  const { sales, totalSales, totalProfit, topProducts } = useMemo(() => {
    const allSales = queryResult || [];
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

    // Filter sales by time window
    const filteredSales = allSales.filter(sale => sale.timestamp >= startTimestamp);

    // Calculate totals
    const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const totalProfit = filteredSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);

    // Aggregate products for "Top Products"
    const productCounts: Record<string, { name: string; quantity: number; revenue: number }> = {};
    
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        if (!productCounts[item.productId]) {
          productCounts[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
        }
        productCounts[item.productId].quantity += item.quantity;
        productCounts[item.productId].revenue += (item.price * item.quantity);
      });
    });

    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      sales: filteredSales.sort((a, b) => b.timestamp - a.timestamp), // latest first
      totalSales,
      totalProfit,
      topProducts,
    };
  }, [queryResult, timeWindow]);

  return {
    sales,
    totalSales,
    totalProfit,
    topProducts,
  };
}
