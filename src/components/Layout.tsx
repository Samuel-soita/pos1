import type { ReactNode } from 'react';
import { ShoppingCart, Package, BarChart3, History, Settings, AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useSync } from '../hooks/useSync';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { status, daysLeft } = useSubscription();
  const { isOnline, isSyncing, syncError } = useSync();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={20} /> },
    { id: 'sales', label: 'Point of Sale', icon: <ShoppingCart size={20} /> },
    { id: 'inventory', label: 'Inventory', icon: <Package size={20} /> },
    { id: 'history', label: 'History', icon: <History size={20} /> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={20} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="desktop-sidebar">
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShoppingCart size={32} />
          <span>POS MVP</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={activeTab === item.id ? 'btn-primary' : 'btn-secondary'}
              style={{ width: '100%', justifyContent: 'flex-start' }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Header & Sync Status */}
        <header style={{ 
          background: 'white', 
          padding: '16px 32px', 
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </h2>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {syncError && <span style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>Sync Error: {syncError}</span>}
            {isSyncing ? (
              <span className="stock-badge stock-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={14} className="spin-animation" /> Syncing...
              </span>
            ) : isOnline ? (
              <span className="stock-badge stock-ok" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wifi size={14} /> Cloud Synced
              </span>
            ) : (
              <span className="stock-badge stock-low" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <WifiOff size={14} /> Offline Mode
              </span>
            )}
          </div>
        </header>

        {/* Subscription Banners */}
        {status === 'grace-period' && (
          <div className="sub-banner sub-warning">
            <AlertCircle size={16} />
            License Expired. Grace Period: {daysLeft} days remaining. Please renew to avoid lockout.
          </div>
        )}
        {status === 'locked' && (
          <div className="sub-banner sub-danger">
            <AlertCircle size={16} />
            Subscription Locked. Please renew your license to resume sales and inventory updates.
          </div>
        )}

        <div className="main-padding">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={activeTab === item.id ? 'btn-primary' : 'btn-secondary'}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
