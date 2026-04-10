import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Lock, ArrowRight, Store, ShieldCheck, Phone, Cpu } from 'lucide-react';

export function AuthScreen() {
  const { businessLogin, staffLogin, engineerSetup } = useAuth();
  const [authMode, setAuthMode] = useState<'business' | 'staff' | 'engineer'>('business');
  
  // Field States
  const [businessName, setBusinessName] = useState('');
  const [businessCode, setBusinessCode] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [customFeatures, setCustomFeatures] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (authMode === 'business') {
        await businessLogin(businessName, businessCode, pin);
      } else if (authMode === 'staff') {
        await staffLogin(businessCode, staffCode, pin);
      } else if (authMode === 'engineer') {
        await engineerSetup(businessName, businessCode, pin, customFeatures);
        setAuthMode('business');
        setError('Business Successfully Registered! You can now login.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-fade-in" style={{ width: '100%', maxWidth: '480px' }}>
        
        {/* Logo Section */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="auth-logo-container" onDoubleClick={() => setAuthMode('engineer')}>
            <img src="/POS1.jpg" alt="SMUTA PAY" className="auth-logo" />
          </div>
          <h1 className="brand-shimmer" style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1px' }}>
            SMUTA PAY
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem', marginTop: '8px', fontWeight: 500 }}>
            {authMode === 'business' ? 'Business Owner Login' : authMode === 'staff' ? 'Staff Login' : 'System Engineer Setup'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="card glass-card" style={{ padding: '40px', border: 'none' }}>
          
          {/* Mode Switcher */}
          {authMode !== 'engineer' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '12px' }}>
              <button 
                onClick={() => setAuthMode('business')}
                style={{ 
                  flex: 1, 
                  background: authMode === 'business' ? 'white' : 'transparent',
                  color: authMode === 'business' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: authMode === 'business' ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                  borderRadius: '10px',
                  padding: '10px',
                  fontWeight: 700,
                  fontSize: '0.9rem'
                }}
              >
                Owner
              </button>
              <button 
                onClick={() => setAuthMode('staff')}
                style={{ 
                  flex: 1, 
                  background: authMode === 'staff' ? 'white' : 'transparent',
                  color: authMode === 'staff' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: authMode === 'staff' ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                  borderRadius: '10px',
                  padding: '10px',
                  fontWeight: 700,
                  fontSize: '0.9rem'
                }}
              >
                Staff
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {error && (
              <div style={{ 
                padding: '14px', 
                background: error.includes('Registered') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', 
                color: error.includes('Registered') ? '#065f46' : '#991b1b', 
                borderRadius: '12px', 
                fontSize: '0.9rem',
                fontWeight: 600,
                border: '1px solid rgba(0,0,0,0.05)',
                textAlign: 'center'
              }}>
                {error}
              </div>
            )}
            
            {/* Input Groups */}
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ color: 'var(--text)', fontWeight: 700 }}>Business Name</label>
              <div className="input-icon-wrapper">
                <input 
                  required 
                  type="text" 
                  className="input-with-icon"
                  placeholder="e.g. My Hardware Store"
                  value={businessName} 
                  onChange={e => setBusinessName(e.target.value)} 
                />
                <Store className="input-icon" size={20} />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ color: 'var(--text)', fontWeight: 700 }}>Business Code</label>
              <div className="input-icon-wrapper">
                <input 
                  required 
                  type="text" 
                  maxLength={4}
                  className="input-with-icon"
                  placeholder="0001"
                  value={businessCode} 
                  onChange={e => setBusinessCode(e.target.value)} 
                />
                <ShieldCheck className="input-icon" size={20} />
              </div>
            </div>

            {authMode === 'staff' && (
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label style={{ color: 'var(--text)', fontWeight: 700 }}>Staff Code</label>
                <div className="input-icon-wrapper">
                  <input 
                    required 
                    type="text" 
                    maxLength={3}
                    className="input-with-icon"
                    placeholder="001"
                    value={staffCode} 
                    onChange={e => setStaffCode(e.target.value)} 
                  />
                  <Phone className="input-icon" size={20} />
                </div>
              </div>
            )}

            {authMode === 'engineer' && (
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label style={{ color: 'var(--text)', fontWeight: 700 }}>Add-on Features (KES 200/mo each)</label>
                <div className="input-icon-wrapper">
                  <input 
                    type="number" 
                    min={0}
                    max={10}
                    className="input-with-icon"
                    placeholder="0"
                    value={customFeatures} 
                    onChange={e => setCustomFeatures(parseInt(e.target.value) || 0)} 
                  />
                  <ShieldCheck className="input-icon" size={20} />
                </div>
              </div>
            )}
            
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ color: 'var(--text)', fontWeight: 700 }}>
                {authMode === 'engineer' ? 'Engineer Tech Code' : '4-Digit PIN'}
              </label>
              <div className="input-icon-wrapper">
                <input 
                  required 
                  type="password" 
                  maxLength={4}
                  className="input-with-icon"
                  placeholder={authMode === 'engineer' ? '0000' : '••••'}
                  value={pin} 
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))} 
                />
                <Lock className="input-icon" size={20} />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ 
              height: '64px',
              fontSize: '1.25rem',
              boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)',
              marginTop: '8px'
            }}>
              {loading ? (
                <span className="spin-animation" style={{ display: 'inline-block' }}>
                  <Cpu size={24} />
                </span>
              ) : (
                <>
                  {authMode === 'engineer' ? 'Complete Tech Setup' : 'Enter Dashboard'}
                  <ArrowRight size={22} />
                </>
              )}
            </button>
          </form>

          {authMode === 'engineer' && (
            <button 
              onClick={() => setAuthMode('business')}
              style={{ marginTop: '20px', width: '100%', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600 }}
            >
              Cancel Setup
            </button>
          )}

          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
              {authMode === 'staff' ? "Switch to Business Owner Access" : "Staff Member? Login here"}
              <button 
                type="button" 
                onClick={() => setAuthMode(authMode === 'business' ? 'staff' : 'business')} 
                style={{ 
                  background: 'transparent', 
                  padding: '0 8px', 
                  color: 'var(--primary)', 
                  fontWeight: 800
                }}
              >
                {authMode === 'business' ? 'Staff Login' : 'Owner Login'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: '40px', color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', fontWeight: 600 }}>
          &copy; {new Date().getFullYear()} SMUTA PAY. Technical Engineer Auth Enabled.
        </p>
      </div>
    </div>
  );
}
