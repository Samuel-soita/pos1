import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { Store, Calculator, ShieldCheck, Lock, Printer, Download } from 'lucide-react';
import { usePrinter } from '../hooks/usePrinter';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSync } from '../hooks/useSync';

export function Settings() {
  const [businessName, setBusinessName] = useState('');
  // useSync initializes background updates
  useSync();
  const { connect, isConnected, deviceName, isSupported } = usePrinter();

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '32px' }}>
        
        {/* Business Profile */}
        <div className="card">
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
        <div className="card">
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
        <div className="card" style={{ gridColumn: '1 / -1' }}>
           <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldCheck size={24} color="var(--primary)" />
            Staff Security Mode
          </h2>
          <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
            Are you handing this tablet to an employee? Enable Staff Mode to restrict access to Inventory and Reports.
            Cashiers will only be able to process Sales and view past Receipts.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr)', gap: '20px', marginBottom: '24px' }}>
            <div 
              style={{ border: `2px solid ${securityMode === 'owner' ? 'var(--primary)' : 'var(--border)'}`, padding: '16px', borderRadius: '12px', cursor: 'pointer', background: securityMode === 'owner' ? '#eff6ff' : 'white' }}
              onClick={() => setSecurityMode('owner')}
            >
              <h3 style={{ fontWeight: 800, marginBottom: '8px' }}>Owner Mode</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>App is completely open. No locks or PINs required to browse tabs.</p>
            </div>
            
            <div 
              style={{ border: `2px solid ${securityMode === 'staff' ? 'var(--danger)' : 'var(--border)'}`, padding: '16px', borderRadius: '12px', cursor: 'pointer', background: securityMode === 'staff' ? '#fef2f2' : 'white' }}
              onClick={() => setSecurityMode('staff')}
            >
              <h3 style={{ fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={16} /> Staff Restricted
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>App locks everything except Sales. Requires Owner PIN to bypass.</p>
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
                style={{ fontSize: '1.5rem', letterSpacing: '0.5rem', textAlign: 'center' }}
              />
            </div>
          )}

          <button className="btn-primary" onClick={handleSaveSecurity} style={{ marginTop: '12px' }}>
            Save Security Policy
          </button>
        </div>

        {/* App Management & Installation */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
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
        <div className="card" style={{ gridColumn: '1 / -1' }}>
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
