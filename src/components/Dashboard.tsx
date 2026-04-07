import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { TrendingUp, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function Dashboard() {
  const { products, getLowStockProducts } = useInventory();
  const { sales } = useSales();

  const lowStock = getLowStockProducts();
  const todayTotal = sales
    .filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + s.total, 0);

  const kpis = [
    { label: "Today's Sales", value: `$${todayTotal.toFixed(2)}`, icon: <TrendingUp size={32} color="var(--primary)" /> },
    { label: "Total Products", value: products.length, icon: <Package size={32} color="var(--secondary)" /> },
    { label: "Low Stock Items", value: lowStock.length, icon: <AlertTriangle size={32} color={lowStock.length > 0 ? "var(--danger)" : "var(--success)"} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Business Performance</h1>
        <p style={{ color: 'var(--text-muted)' }}>Real-time overview of your store's performance.</p>
      </header>

      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
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

const AlertCircle = ({ size, color }: { size: number, color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
);
