import { useState } from 'react';
import { useReports, type TimeWindow } from '../hooks/useReports';
import { useAuth } from '../hooks/useAuth';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, TrendingUp, Download, PieChart, FileText, Users, DollarSign } from 'lucide-react';

export function Reports() {
  const { userType, businessId } = useAuth();
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('month');
  const [selectedBranch, setSelectedBranch] = useState('');
  const { totalSales, totalExpenses, netProfit, topProducts, sales, staffPerformance, trends } = useReports(timeWindow, selectedBranch);

  const branches = useLiveQuery(() => 
    businessId ? db.branches.where('businessId').equals(businessId).toArray() : []
  , [businessId]) || [];

  const handleExportCSV = () => {
    if (sales.length === 0) return alert('No data to export for this period.');

    const headers = ['Receipt ID', 'Date', 'Items Sold', 'Total Sales', 'Total Profit', 'Tax (Inclusive)', 'Tender Type'];
    const rows = sales.map(s => [
      s.receiptId,
      new Date(s.timestamp).toLocaleString(),
      s.items.reduce((sum, item) => sum + item.quantity, 0).toString(),
      s.total.toFixed(2),
      s.totalProfit.toFixed(2),
      (s.taxAmount || 0).toFixed(2),
      s.paymentMethod || 'Cash'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `POS_Report_${timeWindow}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    if (sales.length === 0) return alert('No data to export for this period.');
    
    // Dynamically load heavy PDF libs only when needed
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text('Business Performance Report', 14, 22);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Period: ${timeWindow.toUpperCase()}`, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);

    // Summary Cards
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 45, 85, 25, 'FD'); // Sales Rect
    doc.rect(110, 45, 85, 25, 'FD'); // Profit Rect

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text('Total Sales', 18, 52);
    doc.text('Total Profit', 114, 52);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`KES ${totalSales.toLocaleString()}`, 18, 62);
    doc.setTextColor(239, 68, 68); // Red for expenses
    doc.text(`(KES ${totalExpenses.toLocaleString()})`, 114, 62);
    
    doc.setTextColor(22, 163, 74); // Green for net profit
    doc.setFontSize(14);
    doc.text(`Net Profit: KES ${netProfit.toLocaleString()}`, 114, 75);

    // Table Data
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Transaction History', 14, 85);

    const tableRows = sales.map(s => [
      s.receiptId,
      new Date(s.timestamp).toLocaleDateString(),
      `KES ${s.total.toLocaleString()}`,
      `KES ${(s.taxAmount || 0).toLocaleString()}`,
      s.paymentMethod || 'Cash'
    ]);

    autoTable(doc, {
      startY: 90,
      head: [['Receipt ID', 'Date', 'Sales', 'Tax Inc.', 'Tender']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      margin: { top: 10, bottom: 20 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
    
    if (topProducts.length > 0) {
      doc.text('Top Selling Products', 14, finalY);
      const topRows = topProducts.map(p => [p.name, p.quantity.toString(), `KES ${p.revenue.toLocaleString()}`]);
      autoTable(doc, {
        startY: finalY + 5,
        head: [['Product Name', 'Qty Sold', 'Revenue']],
        body: topRows,
        theme: 'striped',
        headStyles: { fillColor: [100, 116, 139] },
      });
    }

    doc.save(`POS_Report_${timeWindow}_${Date.now()}.pdf`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '32px' }}>
      {/* 0. Executive Daily Summary (Migrated from Dashboard) */}
      {timeWindow === 'day' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div className="card" style={{ border: 'none', background: '#f8fafc', padding: '20px', borderLeft: '4px solid var(--primary)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Today's Sales</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
               <h2 style={{ fontSize: '1.75rem', fontWeight: 900 }}>KES {totalSales.toLocaleString()}</h2>
               <TrendingUp size={16} color="var(--success)" />
            </div>
          </div>
          <div className="card" style={{ border: 'none', background: '#f8fafc', padding: '20px', borderLeft: '4px solid var(--success)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Today's Profit</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
               <h2 style={{ fontSize: '1.75rem', fontWeight: 900 }}>KES {trends?.todayProfit.toLocaleString() || '0'}</h2>
               <DollarSign size={16} color="var(--primary)" />
            </div>
          </div>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Reporting & Analytics</h1>
          <p style={{ color: 'var(--text-muted)' }}>Analyze sales, profit margins, and top products.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <select 
            value={timeWindow} 
            onChange={e => setTimeWindow(e.target.value as TimeWindow)}
            style={{ width: 'auto' }}
          >
            <option value="day">Today</option>
            <option value="week">Past 7 Days</option>
            <option value="month">Past 30 Days</option>
            <option value="quarter">Past Quarter</option>
            <option value="6months">Past 6 Months</option>
            <option value="year">Past Year</option>
          </select>
          <button className="btn-secondary" onClick={handleExportCSV}>
            <Download size={18} /> CSV
          </button>
          <button className="btn-primary" onClick={handleExportPDF}>
            <FileText size={18} /> Export PDF
          </button>
        </div>
      </header>

      {userType === 'owner' && branches.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
           <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Location Filter:</span>
           <select 
             className="btn-secondary" 
             style={{ width: 'auto', minHeight: '36px', fontSize: '0.85rem', background: 'white' }}
             value={selectedBranch}
             onChange={(e) => setSelectedBranch(e.target.value)}
           >
             <option value="">All Branches</option>
             {branches.map(b => (
               <option key={b.id} value={b.id}>{b.name}</option>
             ))}
           </select>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '24px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: '#e0e7ff', padding: '16px', borderRadius: '16px' }}>
            <BarChart3 size={32} color="var(--primary)" />
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Revenue</p>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>KES {totalSales.toLocaleString()}</h2>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '16px' }}>
            <DollarSign size={32} color="var(--danger)" />
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Verified Expenses</p>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>KES {totalExpenses.toLocaleString()}</h2>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', borderLeft: '4px solid var(--success)' }}>
          <div style={{ background: '#dcfce7', padding: '16px', borderRadius: '16px' }}>
            <TrendingUp size={32} color="var(--success)" />
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Net Profit</p>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>KES {netProfit.toLocaleString()}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--success)' }}>
              {totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : '0'}% net margin
            </p>
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="card">
        <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PieChart size={20} color="var(--primary)" />
          Top Performing Products
        </h3>
        
        {topProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
            No sales data for this period.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {topProducts.map((product, idx) => {
              const maxQty = topProducts[0].quantity;
              const widthRatio = (product.quantity / maxQty) * 100;
              return (
                <div key={idx} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', zIndex: 1, position: 'relative' }}>
                    <span style={{ fontWeight: 600 }}>{product.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{product.quantity} sold (KES {product.revenue.toLocaleString()})</span>
                  </div>
                  <div style={{ background: 'var(--background)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ 
                      height: '100%', 
                      background: 'var(--primary)', 
                      width: `${widthRatio}%`,
                      opacity: 1 - (idx * 0.15) // Gradient effect for top lists
                    }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Performance - Exclusive to Owners */}
      {userType === 'owner' && (
        <div className="card">
          <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} color="var(--primary)" />
            Team Performance (Leaderboard)
          </h3>
          
          {staffPerformance.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              No staff performance data available.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {staffPerformance.map((staff, idx) => (
                <div key={idx} style={{ padding: '16px', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700 }}>{staff.name}</span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'var(--primary)', color: 'white', borderRadius: '12px' }}>#{idx+1}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{staff.salesCount} sales</span>
                    <span style={{ fontWeight: 800 }}>KES {staff.revenue.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
