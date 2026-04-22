import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSync } from '../hooks/useSync';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { useCashControl } from '../hooks/useCashControl';
import { useShifts } from '../hooks/useShifts';
import { usePWAUpdate } from '../hooks/usePWAUpdate';
import { useSyncStatus } from '../hooks/useSync';
import { 
  X, LogOut, Lock, Unlock,
  Sparkles, Home, Wallet, ArrowLeft
} from 'lucide-react';
import { LayoutContext, type LayoutProps } from '../context/LayoutContext';

const RESTRICTED_TABS = ['dashboard', 'inventory', 'reports', 'settings', 'staff', 'procurement', 'expenses'];

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  useSync();
  const { status: subStatus, daysLeft, message } = useSubscription();
  const { userType, logout, business } = useAuth();

  const [isManagerUnlocked, setIsManagerUnlocked] = useState(() => 
    sessionStorage.getItem('pos_manager_unlocked') === 'true'
  );
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    sessionStorage.setItem('pos_manager_unlocked', isManagerUnlocked.toString());
  }, [isManagerUnlocked]);

  const { isRegisterOpen, closeRegister, getExpectedCash } = useCashControl();
  const { endShift } = useShifts();

  const ownerPin = useLiveQuery(async () => {
    const setting = await db.settings.get('owner_pin');
    return (setting?.value as string) || '1234';
  }, []) || '1234';

  const securityMode = useLiveQuery(async () => {
    const setting = await db.settings.get('security_mode');
    return (setting?.value as string) || 'owner';
  }, []) || 'owner';

  // Force cashiers or restricted devices out of restricted tabs on boot
  useEffect(() => {
    // Security Lockdown Logic
    const isSuspended = subStatus === 'suspended';
    const isStaff = userType === 'staff';
    const isRestrictedDevice = securityMode === 'staff';

    // Suspended users see restricted views, but OWNERS must still reach Settings to PAY the bill.
    const staffForbidden = isStaff 
      ? Object.entries(business?.staffPermissions || {})
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .filter(([_, allowed]) => !allowed)
          .map(([id]) => id)
      : [];

    const forbiddenTabs = isSuspended 
      ? RESTRICTED_TABS.filter(t => t !== 'settings') 
      : (isRestrictedDevice ? RESTRICTED_TABS : staffForbidden);

    if (!isManagerUnlocked && forbiddenTabs.includes(activeTab)) {
      setActiveTab('sales');
    }
  }, [userType, securityMode, subStatus, isManagerUnlocked, activeTab, setActiveTab, business?.staffPermissions]);

  const requestAuth = (callback: () => void) => {
    if (isManagerUnlocked || userType === 'owner') {
      callback();
    } else {
      setPendingAction(() => callback);
      setShowPinModal(true);
    }
  };

  const handlePinSubmit = () => {
    if (pinInput === ownerPin) {
      setIsManagerUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      alert('Incorrect PIN!');
      setPinInput('');
    }
  };

  const handleLogout = async () => {
    if (userType === 'staff') {
      await endShift();
    }
    logout();
  };

  return (
    <LayoutContext.Provider value={{ requestAuth }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      {/* Vault Blur Layer - Only active during security/locked states */}
      {(showPinModal || subStatus === 'suspended') && (
        <div 
          className="vault-blur" 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 9000,
            pointerEvents: 'auto',
            backdropFilter: 'blur(8px)',
            background: 'rgba(255, 255, 255, 0.01)',
            cursor: 'not-allowed'
          }} 
        />
      )}

      {/* Pin Authorization Modal */}
      {showPinModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card modal-responsive" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock color="var(--danger)" /> Restricted Area
              </h2>
              <button onClick={() => { setShowPinModal(false); setPinInput(''); setActiveTab('dashboard'); }} style={{ background: 'transparent', padding: 0 }}><X size={24} /></button>
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Enter the 4-digit Owner PIN to access this feature.</p>
            <div className="input-group">
              <input
                type="text"
                autoComplete="off"
                maxLength={4}
                autoFocus
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                style={{ fontSize: '2rem', letterSpacing: '1rem', textAlign: 'center', background: '#f1f5f9', border: '2px solid var(--primary)' }}
              />
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '16px' }} onClick={handlePinSubmit}>
              Unlock Register
            </button>
          </div>
        </div>
      )}

      {/* Closing Register Modal */}
      {showClosingModal && (
        <ClosingFloatModal 
          onClose={() => setShowClosingModal(false)} 
          onConfirm={async (actual) => {
            await closeRegister(actual);
            setShowClosingModal(false);
          }}
          getExpected={getExpectedCash}
        />
      )}


      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {subStatus !== 'active' && subStatus !== 'trial' && (
          <div style={{
            background: subStatus === 'suspended' ? 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)' : 
                        subStatus === 'grace' ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)' :
                        'linear-gradient(90deg, var(--primary) 0%, #1d4ed8 100%)',
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
            {subStatus === 'suspended' ? <Lock size={18} /> : <Sparkles size={18} />}
            <span style={{ letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {message}
            </span>
          </div>
        )}
        {(subStatus === 'trial' || subStatus === 'active') && daysLeft <= 5 && (
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
            <span>{message} • {business?.packageId?.toUpperCase()} PLAN</span>
          </div>
        )}
        <header style={{
          background: 'white',
          padding: '16px 32px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {activeTab !== 'dashboard' && (
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="btn-secondary"
                style={{ height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border)' }}
              >
                <ArrowLeft size={18} />
                <span className="desktop-only" style={{ fontWeight: 700 }}>Back</span>
              </button>
            )}
            
            {/* Logo/Home Button */}
            <button 
              onClick={() => setActiveTab('dashboard')}
              style={{ background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '10px', color: 'white' }}>
                <Home size={20} />
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)', letterSpacing: '-0.5px' }} className="desktop-only">SMUTA PAY</span>
            </button>
            
            <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 8px' }} className="desktop-only" />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {activeTab === 'inventory' ? 'My Store' : 
                 activeTab === 'reports' ? 'Analytics' :
                 activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--text-muted)' }}>{business?.name || 'Main'}</span>
                <span style={{ color: 'var(--primary)', textTransform: 'uppercase' }}>{userType === 'owner' ? 'Owner' : 'Staff'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {isRegisterOpen && (
              <button 
                onClick={() => setShowClosingModal(true)}
                className="desktop-only"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  background: '#fef2f2', 
                  color: '#991b1b', 
                  padding: '6px 12px', 
                  borderRadius: '10px', 
                  fontSize: '0.75rem', 
                  fontWeight: 800,
                  border: '1px solid #fee2e2'
                }}
              >
                <Wallet size={14} /> Close Register
              </button>
            )}
            
            {!isManagerUnlocked && userType === 'staff' && (
              <button 
                onClick={() => setShowPinModal(true)}
                className="btn-primary"
                title="Unlock Manager Mode"
                style={{ height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--success)' }}
              >
                <Unlock size={18} />
                <span className="desktop-only" style={{ fontWeight: 800 }}>Unlock Manager</span>
              </button>
            )}

            <button 
              onClick={() => setIsManagerUnlocked(false)}
              className="btn-secondary"
              title="Lock Terminal"
              style={{ width: '40px', height: '40px', padding: 0, display: isManagerUnlocked ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--danger)', color: 'var(--danger)' }}
            >
              <Lock size={18} />
            </button>

            <button 
              onClick={handleLogout}
              className="btn-secondary"
              title="Logout"
              style={{ width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <LogOut size={18} />
            </button>
            
            <UpdateStatus />
            <SyncStatus />
          </div>
        </header>

        <div className="main-padding">
          {children}
        </div>
      </main>

    </div>
    </LayoutContext.Provider>
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
  const { pendingCount, isOnline, isSyncing, activeTerminals } = useSyncStatus();

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px', 
      background: 'var(--bg-secondary)',
      padding: '4px 12px',
      borderRadius: '20px',
      border: `1px solid ${!isOnline ? 'var(--danger)' : (isSyncing ? 'var(--warning)' : 'var(--border)')}`,
      height: '36px',
      transition: 'all 0.3s ease'
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          background: !isOnline ? '#ef4444' : (isSyncing ? '#f59e0b' : '#10b981'),
          boxShadow: isSyncing ? '0 0 8px #f59e0b' : 'none'
        }} />
        {isSyncing && (
          <div style={{ 
            position: 'absolute', 
            inset: -4, 
            border: '2px solid #f59e0b', 
            borderRadius: '50%', 
            animation: 'pulse 1.5s infinite' 
          }} />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
          {!isOnline ? 'OFFLINE' : (isSyncing ? 'SYNCING...' : 'LIVE')}
        </div>
        {isOnline && (
          <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1, marginTop: '2px' }}>
            {activeTerminals} {activeTerminals === 1 ? 'Terminal' : 'Terminals'} Online
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <div style={{ 
          background: 'var(--danger)', 
          color: 'white', 
          fontSize: '0.65rem', 
          fontWeight: 900, 
          padding: '2px 6px', 
          borderRadius: '10px',
          animation: 'bounce 1s infinite'
        }}>
          {pendingCount}
        </div>
      )}
    </div>
  );
}

function ClosingFloatModal({ onClose, onConfirm, getExpected }: { onClose: () => void, onConfirm: (actual: number) => void, getExpected: () => Promise<number> }) {
  const [actual, setActual] = useState('');
  const [expected, setExpected] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(true);

  useEffect(() => {
    getExpected().then(val => {
      setExpected(val);
      setIsCalculating(false);
    });
  }, [getExpected]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actual) return;
    onConfirm(parseFloat(actual));
  };

  const diff = actual ? parseFloat(actual) - (expected || 0) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div className="card modal-responsive" style={{ padding: '32px', maxWidth: '400px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '8px', textAlign: 'center' }}>Close Register</h2>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
          Count your physical cash and type it below. Don't worry if it's slightly off, your manager will review it.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', borderRadius: '12px' }}>
            <span>Expected Cash:</span>
            <span style={{ fontWeight: 800 }}>{isCalculating ? '...' : `KES ${expected?.toLocaleString()}`}</span>
          </div>
          
          <div className="input-group">
            <label>Actual Cash in Drawer</label>
            <input 
              type="number" 
              value={actual} 
              onChange={e => setActual(e.target.value)} 
              placeholder="0" 
              autoFocus 
              required 
              style={{ fontSize: '1.25rem', height: '56px', textAlign: 'center', fontWeight: 800 }}
            />
          </div>

          {!isCalculating && actual && (
            <div style={{ 
              padding: '12px', 
              borderRadius: '12px', 
              textAlign: 'center', 
              background: diff === 0 ? '#dcfce7' : '#fef2f2',
              color: diff === 0 ? '#166534' : '#991b1b',
              fontWeight: 800
            }}>
              {diff === 0 ? '✓ Perfect Balance' : `Discrepancy: KES ${diff.toLocaleString()}`}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={handleSubmit} disabled={isCalculating || !actual}>
            Confirm Close
          </button>
        </div>
      </div>
    </div>
  );
}

