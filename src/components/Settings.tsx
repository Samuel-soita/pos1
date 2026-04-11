import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { Store, Calculator, ShieldCheck, Lock, Printer, Download, Sparkles, CreditCard } from 'lucide-react';
import { usePrinter } from '../hooks/usePrinter';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSync } from '../hooks/useSync';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { PackageSelection } from './PackageSelection';

export function Settings() {
  const [businessName, setBusinessName] = useState('');
  // useSync initializes background updates
  useSync();
  const { connect, isConnected, deviceName, isSupported } = usePrinter();
  const { userType, business } = useAuth();
  const { packages, status, daysLeft } = useSubscription();
  const [showPlanSelector, setShowPlanSelector] = useState(false);

  // Live Settings
  const taxRateSetting = useLiveQuery(() => db.settings.get('tax_rate'));
  const securityModeSetting = useLiveQuery(() => db.settings.get('security_mode'));
  const ownerPinSetting = useLiveQuery(() => db.settings.get('owner_pin'));

  const [taxRate, setTaxRate] = useState(0);
  const [securityMode, setSecurityMode] = useState('owner'); // 'owner' or 'staff'
  const [ownerPin, setOwnerPin] = useState('');

  useEffect(() => {
    async function load() {
      const name = await db.settings.get('business_name');
      if (name) setBusinessName(name.value as string);
    }
    load();
  }, []);

  // Sync from DB to local state during render if DB value changes (effectively "resets" the input)
  // We use a simple guard to avoid loops
  const [lastSyncedTax, setLastSyncedTax] = useState<number | null>(null);
  if (taxRateSetting && taxRateSetting.value !== lastSyncedTax) {
    setLastSyncedTax(taxRateSetting.value as number);
    setTaxRate(taxRateSetting.value as number);
  }

  const [lastSyncedSecurity, setLastSyncedSecurity] = useState<string | null>(null);
  if (securityModeSetting && securityModeSetting.value !== lastSyncedSecurity) {
    setLastSyncedSecurity(securityModeSetting.value as string);
    setSecurityMode(securityModeSetting.value as string);
  }

  const [lastSyncedPin, setLastSyncedPin] = useState<string | null>(null);
  if (ownerPinSetting && ownerPinSetting.value !== lastSyncedPin) {
    setLastSyncedPin(ownerPinSetting.value as string);
    setOwnerPin(ownerPinSetting.value as string);
  }

  useEffect(() => {
    // Check storage persistence
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted();
    }
  }, []);

  const handleUpdateName = async () => {
    await db.settings.put({ key: 'business_name', value: businessName });
    alert('Business name updated!');
  };

  const handleSaveTax = async () => {
    await db.settings.put({ key: 'tax_rate', value: taxRate });
    alert('Tax rate saved globally!');
  };

  const handleSaveSecurity = async () => {
    if (securityMode === 'staff' && (!ownerPin || ownerPin.length < 4)) {
      return alert('You must set a 4-digit PIN before enabling Staff Restricted Mode.');
    }
    await db.settings.put({ key: 'security_mode', value: securityMode });
    await db.settings.put({ key: 'owner_pin', value: ownerPin });
    alert('Security settings enforced! The App will now require this PIN for Analytics/Inventory views.');
    window.location.reload();
  };

  // Sync is now handled entirely in the background

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Store Settings</h1>
        <p style={{ color: 'var(--text-muted)' }}>Manage your business information, taxes, and security.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '24px' }}>
        
        {/* Subscription & Billing - OWNER ONLY */}
        {userType === 'owner' && (
          <div className="card" style={{ border: '2px solid var(--primary)', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', padding: 'min(20px, 4vw)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <CreditCard size={20} color="var(--primary)" />
                  Subscription & Billing
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Manage your plan and business billing.</p>
              </div>
              <div style={{ background: status === 'active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: status === 'active' ? '#166534' : '#991b1b', padding: '6px 12px', borderRadius: '10px', fontWeight: 800, fontSize: '0.8rem' }}>
                {status.toUpperCase()} {daysLeft > 0 && `(${daysLeft}d left)`}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <div style={{ 
                background: 'white', 
                padding: '24px 20px', 
                borderRadius: '20px', 
                border: '1px solid var(--border)',
                textAlign: 'center',
                width: '100%',
                maxWidth: '200px',
                aspectRatio: '1 / 1',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
              }}>
                <div>
                  <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Active Plan</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--primary)' }}>
                    <Sparkles size={18} strokeWidth={3} />
                    <span style={{ fontSize: '1.25rem', fontWeight: 900 }}>
                      {business?.packageId ? packages[business.packageId as keyof typeof packages]?.name : 'None'}
                    </span>
                  </div>
                </div>
                
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Monthly Cost</p>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>
                    KES {business?.packageId ? (packages[business.packageId as keyof typeof packages]?.price || 0).toLocaleString() : '0'}
                  </span>
                </div>
              </div>
            </div>

            {showPlanSelector ? (
              <div className="fade-in" style={{ background: 'white', padding: 'min(16px, 4vw)', borderRadius: '16px', border: '1px solid var(--border)', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1rem' }}>Available Packages</h3>
                  <button className="btn-secondary" style={{ padding: '4px 12px', height: '32px', fontSize: '0.85rem' }} onClick={() => setShowPlanSelector(false)}>Cancel</button>
                </div>
                <PackageSelection isEmbedded onComplete={() => setShowPlanSelector(false)} />
              </div>
            ) : (
              <button className="btn-primary" onClick={() => setShowPlanSelector(true)} style={{ width: 'auto', padding: '8px 20px', height: '44px', fontSize: '0.95rem' }}>
                Change Plan
              </button>
            )}
          </div>
        )}

        {/* Business Profile */}
        <div className="card" style={{ padding: 'min(24px, 5vw)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Store size={24} color="var(--primary)" />
            Business Profile
          </h2>
          <div className="input-group">
            <label>Business / Store Name</label>
            <input 
              type="text" 
              value={businessName} 
              onChange={(e) => setBusinessName(e.target.value)} 
              placeholder="Enter your store name"
            />
          </div>
          <button className="btn-primary" onClick={handleUpdateName}>Update Business Info</button>
        </div>

        {/* Sales & Tax Settings */}
        <div className="card" style={{ padding: 'min(24px, 5vw)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calculator size={24} color="var(--primary)" />
            Sales & Tax
          </h2>
          <div className="input-group">
            <label>Default Tax Rate (%)</label>
            <input 
              type="number" 
              step="0.01"
              value={taxRate} 
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} 
              placeholder="e.g. 16 for 16%"
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tax is calculated inclusively within product prices at checkout.</span>
          </div>
          <button className="btn-primary" onClick={handleSaveTax}>Save Tax Rate</button>
        </div>

        {/* Access Control & Security */}
        <div className="card" style={{ padding: 'min(24px, 5vw)' }}>
           <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldCheck size={24} color="var(--primary)" />
            Staff Security Mode
          </h2>
          <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
            Are you handing this tablet to an employee? Enable Staff Mode to restrict access to Inventory and Reports.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div 
              style={{ border: `2px solid ${securityMode === 'owner' ? 'var(--primary)' : 'var(--border)'}`, padding: '20px', borderRadius: '12px', cursor: 'pointer', background: securityMode === 'owner' ? '#eff6ff' : 'white' }}
              onClick={() => setSecurityMode('owner')}
            >
              <h3 style={{ fontWeight: 800, marginBottom: '8px' }}>Owner Mode</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>App is completely open. No locks or PINs required to browse tabs.</p>
            </div>
            
            <div 
              style={{ border: `2px solid ${securityMode === 'staff' ? 'var(--danger)' : 'var(--border)'}`, padding: '20px', borderRadius: '12px', cursor: 'pointer', background: securityMode === 'staff' ? '#fef2f2' : 'white' }}
              onClick={() => setSecurityMode('staff')}
            >
              <h3 style={{ fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={16} /> Staff Restricted
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>App locks everything except Sales. Requires Owner PIN to bypass.</p>
            </div>
          </div>

          {securityMode === 'staff' && (
            <div className="input-group" style={{ maxWidth: '300px' }}>
              <label>Set 4-Digit Owner PIN</label>
              <input 
                type="password" 
                maxLength={4}
                value={ownerPin} 
                onChange={(e) => setOwnerPin(e.target.value.replace(/[^0-9]/g, ''))} 
                placeholder="0000"
                style={{ fontSize: '1.25rem', letterSpacing: '0.5rem', textAlign: 'center' }}
              />
            </div>
          )}

          <button className="btn-primary" onClick={handleSaveSecurity} style={{ marginTop: '12px', width: 'auto' }}>
            Save Security Policy
          </button>
        </div>

        {/* App Management & Installation */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Download size={24} color="var(--primary)" />
            App Management
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 700, marginBottom: '4px' }}>Installation Status</p>
              <p style={{ color: 'var(--text-muted)' }}>
                {window.matchMedia('(display-mode: standalone)').matches 
                  ? "✓ SMUTA PAY is currently installed and running as a standalone app." 
                  : "Running in Browser. Install for 100% offline reliability."}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  sessionStorage.removeItem('installBannerDismissed');
                  localStorage.removeItem('installBannerSnoozeUntil');
                  window.location.reload();
                }}
              >
                Reset & Show Install Prompt
              </button>
            </div>
          </div>
        </div>

        {/* Hardware & Peripherals */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Printer size={24} color="var(--primary)" />
            Hardware & Peripherals
          </h2>
          <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
            Connect a generic Bluetooth Thermal Receipt Printer (58mm/80mm) directly to your browser.
          </p>

          {!isSupported ? (
            <div style={{ background: '#fef2f2', border: '1px dashed var(--danger)', padding: '16px', borderRadius: '12px', color: '#991b1b' }}>
              <strong>Web Bluetooth is currently unavailable.</strong>
              <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
                Browsers enforce strict hardware security limits. To pair a printer, you must be using <strong>Google Chrome or Edge on Android/PC</strong>, AND the app must be loaded via <strong>HTTPS</strong> or exactly <strong>localhost</strong> (not a local network IP like 192.168.x.x).
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button className={isConnected ? "btn-secondary" : "btn-primary"} onClick={connect}>
                {isConnected ? 'Pair a Different Printer' : 'Pair Bluetooth Printer'}
              </button>
              {isConnected && (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>Connected to: {(deviceName || 'Unknown Thermal Printer')}</span>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
