import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { useSubscription } from '../hooks/useSubscription';
import { Store, CreditCard, RefreshCw, AlertCircle } from 'lucide-react';

export function Settings() {
  const { status, expiryDate, daysLeft } = useSubscription();
  const [businessName, setBusinessName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    async function load() {
      const name = await db.settings.get('business_name');
      const id = await db.settings.get('device_id');
      if (name) setBusinessName(name.value as string);
      if (id) setDeviceId(id.value as string);
    }
    load();
  }, []);

  const handleUpdateName = async () => {
    await db.settings.put({ key: 'business_name', value: businessName });
    alert('Business name updated locally!');
  };

  const simulateExpiry = async (hoursOffset: number) => {
    const newExpiry = Date.now() + (hoursOffset * 60 * 60 * 1000);
    await db.settings.put({ key: 'expiry_date', value: newExpiry });
    window.location.reload(); // Refresh to re-trigger useSubscription logic
  };

  const handleSync = () => {
    setIsSyncing(true);
    // Simulate API call for sync
    setTimeout(() => {
      setIsSyncing(false);
      alert('Data synced with cloud backup successfully!');
    }, 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Store Settings</h1>
        <p style={{ color: 'var(--text-muted)' }}>Manage your business information and license.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        {/* Business Settings */}
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

        {/* Subscription / License */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CreditCard size={24} color="var(--primary)" />
            License & Subscription
          </h2>
          
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Device Identifier</p>
            <p style={{ fontWeight: 700, fontSize: '1.125rem' }}>{deviceId}</p>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', background: status === 'active' ? '#f0f9ff' : '#fff1f1', border: `1px solid ${status === 'active' ? '#e0f2fe' : '#fee2e2'}`, marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600 }}>Status</span>
              <span style={{ 
                color: status === 'active' ? 'var(--primary)' : 'var(--danger)', 
                fontWeight: 800,
                textTransform: 'uppercase'
              }}>
                {status}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>Expires in</span>
              <span>{expiryDate ? new Date(expiryDate as number).toLocaleDateString() : 'N/A'} ({daysLeft} days)</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Developer Simulation Mode:</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button className="btn-secondary" onClick={() => simulateExpiry(-72)}>Expire License (-3 days)</button>
              <button className="btn-secondary" onClick={() => simulateExpiry(-100)}>Lock App (-4 days)</button>
              <button className="btn-secondary" onClick={() => simulateExpiry(240)}>Renew (10 Days Trial)</button>
            </div>
          </div>
        </div>

        {/* Sync & Backup */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <RefreshCw size={24} className={isSyncing ? 'animate-spin' : ''} color="var(--primary)" />
            Cloud Backup & Sync
          </h2>
          <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
            Sync your local sales and inventory with the cloud to ensure no data is lost. This can be done whenever your device is online.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn-primary" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <div style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)' }}>
              <AlertCircle size={16} />
              Last Sync: Just now
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
