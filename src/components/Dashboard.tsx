import { useInventory } from '../hooks/useInventory';
import { TrendingUp, Package, AlertTriangle, CheckCircle2, Wallet, BarChart3, Users, Settings, AlertCircle } from 'lucide-react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';

export function Dashboard({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const { products, getLowStockProducts } = useInventory();
  
  const securityModeSetting = useLiveQuery(() => db.settings.get('security_mode'));
  const isOwner = securityModeSetting?.value !== 'staff';

  const lowStock = getLowStockProducts();

  // Optimized Indexed Queries for Today
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayEnd = new Date().setHours(23, 59, 59, 999);

  const stats = useLiveQuery(async () => {
    const todaySales = await db.sales
      .where('timestamp')
      .between(todayStart, todayEnd)
      .toArray();
    
    const todayExpenses = await db.expenses
      .where('timestamp')
      .between(todayStart, todayEnd)
      .toArray();

    const totalSales = todaySales.reduce((sum, s) => sum + s.total, 0);
    const grossProfit = todaySales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
    const totalExpenses = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      totalSales,
      grossProfit,
      totalExpenses,
      netProfit: grossProfit - totalExpenses
    };
  }, [todayStart, todayEnd]) || { totalSales: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0 };

  const kpis = [
    { label: "Today's Sales", value: `KES ${stats.totalSales.toLocaleString()}`, icon: <TrendingUp size={32} color="var(--primary)" /> },
    ...(isOwner ? [
      { label: "Today's Expenses", value: `KES ${stats.totalExpenses.toLocaleString()}`, icon: <Wallet size={32} color="var(--danger)" /> },
      { label: "Net Profit", value: `KES ${stats.netProfit.toLocaleString()}`, icon: <TrendingUp size={32} color={stats.netProfit >= 0 ? "var(--success)" : "var(--danger)"} /> }
    ] : []),
    { label: "Total Stock Items", value: products.reduce((sum, p) => sum + p.quantity, 0).toLocaleString(), icon: <Package size={32} color="var(--secondary)" /> },
    { label: "Low Stock Alerts", value: lowStock.length, icon: <AlertTriangle size={32} color={lowStock.length > 0 ? "var(--danger)" : "var(--success)"} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Business Performance</h1>
        <p style={{ color: 'var(--text-muted)' }}>Real-time overview of your store's performance.</p>
      </header>

      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '24px' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '16px' }}>{kpi.icon}</div>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>{kpi.label}</p>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{kpi.value}</h2>
            </div>
          </div>
        ))}
      </div>

      {/* Management Section */}
      <div>
        <h3 style={{ marginBottom: '20px', fontWeight: 800, fontSize: '1.25rem' }}>Store Management</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
          <button 
            onClick={() => onTabChange('reports')}
            className="card" 
            style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', cursor: 'pointer', textAlign: 'left', background: 'white' }}
          >
            <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '12px' }}>
              <BarChart3 size={24} color="#4338ca" />
            </div>
            <div>
              <p style={{ fontWeight: 700 }}>Analytics & Reports</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>View detailed sales trends</p>
            </div>
          </button>

          <button 
            onClick={() => onTabChange('staff')}
            className="card" 
            style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', cursor: 'pointer', textAlign: 'left', background: 'white' }}
          >
            <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '12px' }}>
              <Users size={24} color="#b45309" />
            </div>
            <div>
              <p style={{ fontWeight: 700 }}>Staff Management</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Manage roles and PINs</p>
            </div>
          </button>

          <button 
            onClick={() => onTabChange('settings')}
            className="card" 
            style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', cursor: 'pointer', textAlign: 'left', background: 'white' }}
          >
            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '12px' }}>
              <Settings size={24} color="var(--secondary)" />
            </div>
            <div>
              <p style={{ fontWeight: 700 }}>Settings</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Configure app & billing</p>
            </div>
          </button>
        </div>
      </div>

      {/* Low Stock Section */}
      <div className="card">
        <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} color="var(--danger)" />
          Low Stock Alerts
        </h3>
        {lowStock.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={48} color="var(--success)" style={{ display: 'block', margin: '0 auto 16px' }} />
            All stock levels are optimal.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lowStock.map(product => (
              <div key={product.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: '#fff1f1', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{product.name}</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>Only {product.quantity} left in stock</p>
                </div>
                <div className="stock-badge stock-low">Alert: {product.lowStockThreshold} threshold</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
