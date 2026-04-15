import { useAuth } from '../hooks/useAuth';
import { useInventory } from '../hooks/useInventory';
import { useCashControl } from '../hooks/useCashControl';
import { 
  ShoppingCart, Receipt, Truck,
  Package, BarChart3, Users, Settings, Lock, Unlock,
  AlertTriangle, LogOut, CheckCircle2, X
} from 'lucide-react';
import { usePrinter } from '../hooks/usePrinter';
import { useState, useEffect } from 'react';
import { useLayout } from '../context/LayoutContext';

interface FeatureItem {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  badge?: string;
  badgeColor?: string;
}

interface ZReportData {
  openingFloat: number;
  cashSales: number;
  mpesaSales: number;
  expenses: number;
  expectedCash: number;
  salesCount: number;
  expensesCount: number;
}

export function Dashboard({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const { userType, business, staff } = useAuth();
  const { getLowStockProducts } = useInventory();
  const { isRegisterOpen, getZReportData, closeRegister, openRegister, currentLog } = useCashControl();
  const { printZReport, isConnected } = usePrinter();
  const { requestAuth } = useLayout();
  
  const [zData, setZData] = useState<ZReportData | null>(null);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [openingFloat, setOpeningFloat] = useState<number>(0);
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const lowStock = getLowStockProducts?.() || [];

  useEffect(() => {
    if (isRegisterOpen) {
      getZReportData().then(setZData);
    }
  }, [isRegisterOpen, getZReportData]);

  const displayName = userType === 'staff' ? staff?.firstName : business?.name;

  const features: FeatureItem[] = [
    { 
      id: 'sales', 
      title: 'Sales', 
      desc: 'Process transactions & print receipts', 
      icon: <ShoppingCart size={28} />, 
      gradient: 'card-gradient-primary',
      badge: isRegisterOpen ? 'Live' : undefined,
      badgeColor: isRegisterOpen ? 'var(--success)' : 'var(--danger)'
    },
    { 
      id: 'inventory', 
      title: 'Stocks', 
      desc: 'Inventory & stock management', 
      icon: <Package size={28} />, 
      gradient: 'card-gradient-amber',
      badge: lowStock.length > 0 ? `${lowStock.length} Alerts` : undefined,
      badgeColor: lowStock.length > 0 ? 'var(--danger)' : 'var(--success)'
    },
    { 
      id: 'purchases', 
      title: 'Purchases', 
      desc: 'Buy and restock items', 
      icon: <ShoppingCart size={28} />, 
      gradient: 'card-gradient-success'
    },
    { 
      id: 'suppliers', 
      title: 'Suppliers', 
      desc: 'Manage your contacts', 
      icon: <Truck size={28} />, 
      gradient: 'card-gradient-rose'
    },
    { 
      id: 'reports', 
      title: 'Sales & Profit', 
      desc: 'Total Money In & Out', 
      icon: <BarChart3 size={28} />, 
      gradient: 'card-gradient-success'
    },
    { 
      id: 'staff', 
      title: 'Staff Management', 
      desc: 'Staff roles, PINs & shifts', 
      icon: <Users size={28} />, 
      gradient: 'card-gradient-slate'
    },
    { 
      id: 'expenses', 
      title: 'Expenses', 
      desc: 'Track shop spending', 
      icon: <Receipt size={28} />, 
      gradient: 'card-gradient-rose' 
    },
    { 
      id: 'settings', 
      title: 'Settings', 
      desc: 'Business profile & POS config', 
      icon: <Settings size={28} />, 
      gradient: 'card-gradient-slate'
    }
  ];

  const handleFeatureClick = (item: FeatureItem) => {
    // Dynamic Permission Check:
    // If user is staff, check if the business has explicitly disabled this tab.
    const permissionKey = ['purchases', 'suppliers'].includes(item.id) ? 'procurement' : item.id;
    const isRestricted = userType === 'staff' && business?.staffPermissions?.[permissionKey] === false;

    if (isRestricted) {
      requestAuth(() => onTabChange(item.id));
    } else {
      onTabChange(item.id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '80px' }}>
      <header className="welcome-section welcome-greeting">
        <h1 className="welcome-title">Hello, {displayName || 'Partner'}</h1>
        <p className="welcome-subtitle">What would you like to manage today?</p>
      </header>

      {/* EOD Quick Status */}
      {isRegisterOpen && zData ? (
        <section style={{ padding: '0 20px', marginBottom: '32px' }}>
          <div className="card" style={{ 
            background: 'var(--bg-secondary)', 
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '4px' }}>Shift in Progress</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Opened at {new Date(currentLog?.timestamp || 0).toLocaleTimeString()}</p>
              </div>
              <button 
                onClick={() => { setActualCash(zData.expectedCash); setShowClosingModal(true); }}
                className="btn-primary" 
                style={{ background: 'var(--danger)', height: '44px' }}
              >
                <LogOut size={18} /> Close Register
              </button>
            </div>

            <div style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', display: 'grid', gap: '16px' }}>
              <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>CASH SALES</p>
                <p style={{ fontSize: '1.15rem', fontWeight: 900 }}>KES {zData.cashSales.toLocaleString()}</p>
              </div>
              <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>MPESA SALES</p>
                <p style={{ fontSize: '1.15rem', fontWeight: 900 }}>KES {zData.mpesaSales.toLocaleString()}</p>
              </div>
              <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>EXPENSES</p>
                <p style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--danger)' }}>KES {zData.expenses.toLocaleString()}</p>
              </div>
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>EXPECTED CASH</p>
                <p style={{ fontSize: '1.15rem', fontWeight: 900, color: '#15803d' }}>KES {zData.expectedCash.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </section>
      ) : !isRegisterOpen && (
        <section style={{ padding: '0 20px', marginBottom: '32px' }}>
          <div className="card" style={{ 
            background: 'var(--card-gradient-primary)', 
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '40px 20px',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(37, 99, 235, 0.2)'
          }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '16px', borderRadius: '50%' }}>
              <Unlock size={32} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '8px' }}>Register is Locked</h2>
              <p style={{ opacity: 0.9, fontSize: '0.95rem' }}>Start your business day to begin recording sales and tracking revenue.</p>
            </div>
            <button 
              onClick={() => setShowOpeningModal(true)}
              className="btn-primary" 
              style={{ background: 'white', color: 'var(--primary)', border: 'none', height: '56px', padding: '0 40px', fontSize: '1.1rem', fontWeight: 800 }}
            >
              Open Register
            </button>
          </div>
        </section>
      )}

      {/* THE MASTER HUB (The Feature Grid Only) */}
      <section style={{ padding: '0 20px', width: '100%' }}>
        <div className="hub-grid">
          {features.map((item) => {
            const permissionKey = ['purchases', 'suppliers'].includes(item.id) ? 'procurement' : item.id;
            const isLocked = userType === 'staff' && business?.staffPermissions?.[permissionKey] === false;
            
            return (
                <div 
                  key={item.id} 
                  className="hub-card-wrapper"
                  onClick={() => handleFeatureClick(item)}
                  title={isLocked ? 'Restricted: Owner Access Required' : item.desc}
                  style={{ opacity: isLocked ? 0.7 : 1 }}
                >
                  <div className="hub-card" style={{ 
                    background: isLocked ? 'var(--secondary)' : undefined,
                    filter: isLocked ? 'grayscale(0.5)' : 'none'
                  }}>
                    <div className="hub-card-icon">
                      <div>{item.icon}</div>
                    </div>
                    {isLocked && (
                      <div style={{ position: 'absolute', bottom: '-5px', right: '-5px', background: 'var(--danger)', color: 'white', padding: '6px', borderRadius: '50%', display: 'flex', border: '2px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                        <Lock size={12} fill="currentColor" />
                      </div>
                    )}
                    {item.badge && !isLocked && (
                      <span className="hub-card-badge">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h4 className="hub-card-title" style={{ color: isLocked ? 'var(--secondary)' : 'var(--text)' }}>
                    {item.title}
                  </h4>
                </div>
            );
          })}
        </div>
      </section>

      {/* Opening Modal */}
      {showOpeningModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', animation: 'auth-fade 0.3s ease-out' }}>
            <h2 style={{ marginBottom: '8px', fontWeight: 900 }}>Open Register</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>Record the starting cash in your drawer.</p>
            
            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label>Opening Float (Cash On Hand)</label>
              <input 
                autoFocus
                type="number" 
                value={openingFloat} 
                onChange={e => setOpeningFloat(parseFloat(e.target.value) || 0)} 
                style={{ fontSize: '2rem', textAlign: 'center', fontWeight: 900, height: '74px', background: 'var(--bg-secondary)' }}
                placeholder="0.00"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                onClick={async () => {
                   setIsOpening(true);
                   await openRegister(openingFloat);
                   setIsOpening(false);
                   setShowOpeningModal(false);
                }}
                className="btn-primary" 
                style={{ height: '54px', fontSize: '1.1rem' }}
                disabled={isOpening}
              >
                {isOpening ? 'Opening...' : 'Start Business Day'}
              </button>
              <button 
                onClick={() => setShowOpeningModal(false)}
                className="btn-secondary" 
                style={{ height: '44px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Closing Reconciliation Modal */}
      {showClosingModal && zData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Close Register</h2>
              <button onClick={() => setShowClosingModal(false)} style={{ background: 'transparent' }}><X size={24} /></button>
            </div>

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Expected Cash</span>
                <span style={{ fontWeight: 800 }}>KES {zData.expectedCash.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Discrepancy</span>
                <span style={{ fontWeight: 900, color: (actualCash - zData.expectedCash) === 0 ? '#15803d' : 'var(--danger)' }}>
                  KES {(actualCash - zData.expectedCash).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label>Actual Physical Cash in Drawer</label>
              <input 
                autoFocus
                type="number" 
                value={actualCash} 
                onChange={e => setActualCash(parseFloat(e.target.value) || 0)} 
                style={{ fontSize: '2rem', textAlign: 'center', fontWeight: 900, height: '70px', background: 'var(--bg-secondary)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                onClick={async () => {
                   setIsClosing(true);
                   if (isConnected) {
                     await printZReport(zData, business!);
                   }
                   await closeRegister(actualCash);
                   setIsClosing(false);
                   setShowClosingModal(false);
                }}
                className="btn-primary" 
                style={{ height: '54px', fontSize: '1.1rem' }}
                disabled={isClosing}
              >
                {isClosing ? 'Closing...' : (
                  <>
                    <CheckCircle2 size={20} /> Finalize & Print Z-Report
                  </>
                )}
              </button>
              <button 
                onClick={() => setShowClosingModal(false)}
                className="btn-secondary" 
                style={{ height: '44px' }}
              >
                Cancel
              </button>
            </div>

            {!isConnected && (
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '0.8rem', justifyContent: 'center' }}>
                <AlertTriangle size={14} />
                <span>Printer disconnected. Z-Report will be digital only.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
