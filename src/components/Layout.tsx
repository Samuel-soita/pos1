import { useState, useEffect, type ReactNode } from 'react';
import { ShoppingCart, Package, BarChart3, History, Settings, Lock, X, Cloud, CloudOff, RefreshCw, Sparkles, Receipt } from 'lucide-react';
import { usePWAUpdate } from '../hooks/usePWAUpdate';
import { useSync, useSyncStatus } from '../hooks/useSync';
import { useSubscription } from '../hooks/useSubscription';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useAuth } from '../hooks/useAuth';
import { Users } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const RESTRICTED_TABS = ['dashboard', 'inventory', 'reports', 'settings', 'staff'];

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  // useSync is called to ensure background syncing is initialized
  useSync();
  const { status, daysLeft, isTrial } = useSubscription();
  const { userType, logout, business } = useAuth();

  const [isManagerUnlocked, setIsManagerUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [attemptedTab, setAttemptedTab] = useState<string | null>(null);

  const ownerPin = useLiveQuery(async () => {
    const setting = await db.settings.get('owner_pin');
    return (setting?.value as string) || '1234';
  }, []) || '1234';

  // Force cashiers out of restricted tabs on boot
  useEffect(() => {
    if (userType === 'staff' && RESTRICTED_TABS.includes(activeTab)) {
      setActiveTab('sales');
    }
  }, [userType, activeTab, setActiveTab]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={20} /> },
    { id: 'sales', label: 'Sales', icon: <ShoppingCart size={20} /> },
    { id: 'inventory', label: 'My Store', icon: <Package size={20} /> },
    { id: 'expenses', label: 'Expenses', icon: <Receipt size={20} /> },
    { id: 'staff', label: 'Staff', icon: <Users size={20} /> },
    { id: 'history', label: 'History', icon: <History size={20} /> },
    { id: 'reports', label: 'Analytics', icon: <BarChart3 size={20} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
  ];

  const handleTabClick = (tabId: string) => {
    if (userType === 'staff' && RESTRICTED_TABS.includes(tabId) && !isManagerUnlocked) {
      setAttemptedTab(tabId);
      setShowPinModal(true);
      return;
    }
    setActiveTab(tabId);
  };

  const handlePinSubmit = () => {
    if (pinInput === ownerPin) {
      setIsManagerUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
      if (attemptedTab) {
        setActiveTab(attemptedTab);
      }
    } else {
      alert('Incorrect PIN!');
      setPinInput('');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* Pin Authorization Modal */}
      {showPinModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card modal-responsive" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock color="var(--danger)" /> Restricted Area
              </h2>
              <button onClick={() => { setShowPinModal(false); setPinInput(''); }} style={{ background: 'transparent', padding: 0 }}><X size={24} /></button>
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Enter the 4-digit Owner PIN to access this feature.</p>
            <div className="input-group">
              <input
                type="password"
                maxLength={4}
                autoFocus
                value={pinInput}
                onChange={e => setPinInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                style={{ fontSize: '2rem', letterSpacing: '1rem', textAlign: 'center' }}
              />
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '16px' }} onClick={handlePinSubmit}>
              Unlock Register
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="desktop-sidebar">
        <div style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShoppingCart size={32} color="var(--primary)" />
          <span className="brand-shimmer">SMUTA PAY</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {navItems.map(item => {
            const isLocked = userType === 'staff' && RESTRICTED_TABS.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={activeTab === item.id ? 'btn-primary' : 'btn-secondary'}
                style={{ width: '100%', justifyContent: 'space-between', opacity: isLocked ? 0.6 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {item.icon}
                  {item.label}
                </div>
                {isLocked && <Lock size={14} color="var(--text-muted)" />}
              </button>
            );
          })}
        </nav>

        <button 
          onClick={logout}
          className="btn-secondary"
          style={{ width: '100%', marginTop: 'auto', border: '1px solid var(--danger)', color: 'var(--danger)' }}
        >
          Logout
        </button>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {status !== 'active' && (
          <div style={{
            background: status === 'locked' ? 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
            color: 'white',
            padding: '12px 32px',
            fontSize: '0.9rem',
            fontWeight: 800,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            zIndex: 100
          }}>
            <Lock size={18} />
            <span style={{ letterSpacing: '0.5px' }}>
              {status === 'locked'
                ? 'ACCOUNT LOCKED • VIEW-ONLY MODE • PAY TO UNLOCK'
                : `GRACE PERIOD • ${daysLeft} DAYS REMAINING TO AVOID LOCK`}
            </span>
          </div>
        )}
        {status === 'active' && isTrial && daysLeft <= 5 && (
          <div style={{
            background: 'linear-gradient(90deg, var(--primary) 0%, #1d4ed8 100%)',
            color: 'white',
            padding: '10px 32px',
            fontSize: '0.85rem',
            fontWeight: 700,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            letterSpacing: '0.5px'
          }}>
            <Sparkles size={16} />
            <span>TRIAL ACTIVE • {daysLeft} DAYS REMAINING • {business?.packageId?.toUpperCase()} PLAN</span>
          </div>
        )}
        <header style={{
          background: 'white',
          padding: '16px 32px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              {activeTab === 'inventory' ? 'My Store' : 
               activeTab === 'reports' ? 'Analytics' :
               activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h2>
            <div className="welcome-greeting" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {business?.name || 'SMUTA PAY'} Dashboard
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <UpdateStatus />
            <SyncStatus />
          </div>
        </header>

        <div className="main-padding">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {navItems.map(item => {
          const isLocked = userType === 'staff' && !isManagerUnlocked && RESTRICTED_TABS.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={activeTab === item.id ? 'btn-primary' : 'btn-secondary'}
            >
              <div style={{ position: 'relative' }}>
                {item.icon}
                {isLocked && <Lock size={10} style={{ position: 'absolute', top: -4, right: -8, color: 'var(--danger)' }} />}
              </div>
              <span style={{ fontSize: '0.7rem' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  );
}
function UpdateStatus() {
  const { isUpdateAvailable, update } = usePWAUpdate();

  if (!isUpdateAvailable) return null;

  return (
    <button
      onClick={update}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: 'var(--primary)',
        background: 'var(--bg-secondary)',
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '0.75rem',
        fontWeight: 700,
        border: '1px solid var(--primary)',
        cursor: 'pointer',
        animation: 'pulse 2s infinite'
      }}
    >
      <Sparkles size={14} />
      <span>Update Available</span>
    </button>
  );
}
function SyncStatus() {
  const { pendingCount, isOnline, isSyncing } = useSyncStatus();

  if (isSyncing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>
        <RefreshCw size={18} className="spin-animation" />
        <span className="desktop-only">Syncing...</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)', fontWeight: 600, fontSize: '0.85rem' }}>
        <CloudOff size={18} />
        <span>Offline {pendingCount > 0 && `(${pendingCount} pending)`}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>
      <Cloud size={18} />
      <span className="desktop-only">{pendingCount > 0 ? `${pendingCount} Items Pending` : 'Synced'}</span>
      {pendingCount > 0 && <span className="mobile-only">({pendingCount})</span>}
    </div>
  );
}
