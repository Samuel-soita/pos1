import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useShifts } from '../hooks/useShifts';
import { Lock, ArrowRight, Store, ShieldCheck, Phone, Cpu, Mail, Globe } from 'lucide-react';

export function AuthScreen() {
  const { businessLogin, staffLogin, provisionBusiness } = useAuth();
  const { startShift } = useShifts();
  const [authMode, setAuthMode] = useState<'business' | 'staff' | 'provisioning'>('business');
  
  // Field States
  const [businessName, setBusinessName] = useState('');
  const [businessCode, setBusinessCode] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [activationToken, setActivationToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let success = false;
    try {
      if (authMode === 'business') {
        await businessLogin(businessCode, pin);
        success = true;
      } else if (authMode === 'staff') {
        await staffLogin(staffCode, pin);
        success = true;
      } else if (authMode === 'provisioning') {
        if (pin !== confirmPin) {
          throw new Error('PIN inputs do not match. Please try again.');
        }
        const newBiz = await provisionBusiness(activationToken, businessName, pin, ownerEmail);
        setAuthMode('business');
        setBusinessCode(newBiz.code); // Pre-fill for convenience
        setPin(''); 
        setConfirmPin('');
        setError(`🎉 Provisioning Successful! Store Code is: ${newBiz.code}. Please log in.`);
        success = false; // Prevents direct entry
      }
    } catch (err: unknown) {
      const authError = err as Error; 
      console.error('Auth Error Details:', authError);
      
      const msg = authError.message || 'Authentication failed';
      
      if (msg.includes('Email not confirmed')) {
        setError('❌ Account verification required. Please check your email.');
      } else if (msg.toLowerCase().includes('invalid_credentials') || msg.toLowerCase().includes('not found')) {
        setError('❌ Invalid Credentials. Please check your Code and PIN.');
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        setError('📡 Connection issue. Your session will sync in the background.');
      } else {
        setError(`❌ ${msg}`);
      }
    } finally {
      setLoading(false);
    }
    
    if (success && authMode === 'staff') {
      await startShift();
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-fade-in" style={{ width: '100%', maxWidth: '480px' }}>
        
        {/* Logo Section */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="auth-logo-container">
            <img src="/POS1.jpg" alt="SMUTA PAY" className="auth-logo" />
          </div>
          <h1 className="brand-shimmer" style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1px' }}>
            SMUTA PAY
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem', marginTop: '8px', fontWeight: 500 }}>
            {authMode === 'business' ? 'Business Owner login' : authMode === 'staff' ? 'Staff Login' : 'System Provisioning'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="card glass-card" style={{ padding: '40px', border: 'none' }}>
          
          {/* Mode Switcher */}
          {authMode !== 'provisioning' && (
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {error && (
              <div style={{ 
                padding: '14px', 
                background: error.includes('Success') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', 
                color: error.includes('Success') ? '#065f46' : '#991b1b', 
                borderRadius: '12px', 
                fontSize: '0.9rem',
                fontWeight: 600,
                border: '1px solid rgba(0,0,0,0.05)',
                textAlign: 'center'
              }}>
                {error}
              </div>
            )}
            
            {/* --- PROVISIONING FIELDS --- */}
            {authMode === 'provisioning' && (
              <>
                <div className="input-group">
                  <label style={{ fontWeight: 700 }}>Activation Token</label>
                  <div className="input-icon-wrapper">
                    <input 
                      required 
                      type="text" 
                      placeholder="XXXX-XXXX-XXXX"
                      value={activationToken} 
                      onChange={e => setActivationToken(e.target.value)} 
                    />
                    <ShieldCheck className="input-icon" size={20} />
                  </div>
                </div>
                <div className="input-group">
                  <label style={{ fontWeight: 700 }}>Business Name</label>
                  <div className="input-icon-wrapper">
                    <input 
                      required 
                      type="text" 
                      placeholder="e.g. Acme Stores"
                      value={businessName} 
                      onChange={e => setBusinessName(e.target.value)} 
                    />
                    <Store className="input-icon" size={20} />
                  </div>
                </div>
              </>
            )}

            {/* --- COMMON FIELDS (Owner/Provisioning) --- */}
            {/* --- BUSINESS LOGIN FIELD --- */}
            {authMode === 'business' && (
              <div className="input-group">
                <label style={{ fontWeight: 700 }}>Business Code</label>
                <div className="input-icon-wrapper">
                  <input 
                    required 
                    type="text" 
                    maxLength={8}
                    placeholder="ABC-123"
                    value={businessCode} 
                    onChange={e => setBusinessCode(e.target.value)} 
                  />
                  <Globe className="input-icon" size={20} />
                </div>
              </div>
            )}

            {/* --- PROVISIONING EMAIL FIELD --- */}
            {authMode === 'provisioning' && (
              <div className="input-group">
                <label style={{ fontWeight: 700 }}>Owner Email</label>
                <div className="input-icon-wrapper">
                  <input 
                    required 
                    type="email" 
                    placeholder="owner@example.com"
                    value={ownerEmail} 
                    onChange={e => setOwnerEmail(e.target.value)} 
                  />
                  <Mail className="input-icon" size={20} />
                </div>
              </div>
            )}

            {/* --- STAFF FIELDS --- */}
            {authMode === 'staff' && (
              <div className="input-group">
                <label style={{ fontWeight: 700 }}>Staff Code</label>
                <div className="input-icon-wrapper">
                  <input 
                    required 
                    type="text" 
                    maxLength={3}
                    placeholder="001"
                    value={staffCode} 
                    onChange={e => setStaffCode(e.target.value)} 
                  />
                  <Phone className="input-icon" size={20} />
                </div>
              </div>
            )}
            
            <div className="input-group">
              <label style={{ fontWeight: 700 }}>
                {authMode === 'provisioning' ? 'Set Owner 4-Digit PIN' : '4-Digit PIN'}
              </label>
              <div className="input-icon-wrapper">
                <input 
                  required 
                  type="text" 
                  autoComplete="off"
                  maxLength={4}
                  placeholder="0000"
                  style={{ fontSize: '1.5rem', letterSpacing: '4px', textAlign: 'center' }}
                  value={pin} 
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))} 
                />
                <Lock className="input-icon" size={20} />
              </div>
            </div>

            {authMode === 'provisioning' && (
              <div className="input-group">
                <label style={{ fontWeight: 700 }}>Confirm Owner PIN</label>
                <div className="input-icon-wrapper">
                  <input 
                    required 
                    type="text" 
                    autoComplete="off"
                    maxLength={4}
                    placeholder="0000"
                    style={{ fontSize: '1.5rem', letterSpacing: '4px', textAlign: 'center' }}
                    value={confirmPin} 
                    onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} 
                  />
                  <Lock className="input-icon" size={20} />
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading} style={{ 
              height: '64px',
              fontSize: '1.2rem',
              boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)',
              marginTop: '8px'
            }}>
              {loading ? (
                <span className="spin-animation" style={{ display: 'inline-block' }}>
                  <Cpu size={24} />
                </span>
              ) : (
                <>
                  {authMode === 'provisioning' ? 'Activate & Provision Store' : 'Enter Dashboard'}
                  <ArrowRight size={22} />
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: '32px', textAlign: 'center' }}>
             {authMode === 'provisioning' ? (
               <button 
                 onClick={() => setAuthMode('business')} 
                 style={{ background: 'transparent', color: 'var(--text-muted)', fontWeight: 600 }}
               >
                 Cancel Provisioning
               </button>
             ) : (
                !localStorage.getItem('pinned_biz_code') ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    New device setup? 
                    <button 
                      onClick={() => setAuthMode('provisioning')} 
                      style={{ background: 'transparent', padding: '0 8px', color: 'var(--primary)', fontWeight: 800 }}
                    >
                      Admin Provisioning
                    </button>
                  </p>
                ) : null
             )}
          </div>
        </div>

        {/* Support Link */}
        <p style={{ textAlign: 'center', marginTop: '40px', color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', fontWeight: 600 }}>
          &copy; {new Date().getFullYear()} SMUTA PAY. Robust Multi-Tenant POS.
        </p>
      </div>
    </div>
  );
}
