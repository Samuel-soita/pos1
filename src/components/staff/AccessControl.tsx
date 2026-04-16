import { ShieldCheck } from 'lucide-react';
import { type Business } from '../../db/db';

interface AccessControlProps {
  business: Business | null;
  onToggle: (permId: string) => void;
}

export function AccessControl({ business, onToggle }: AccessControlProps) {
  const permissionsList = [
    { id: 'inventory', label: 'Stocks & Inventory', desc: 'Allow staff to see and count stock' },
    { id: 'expenses', label: 'Expenses', desc: 'Allow staff to view/record expenses' },
    { id: 'procurement', label: 'Suppliers and Purchases', desc: 'Suppliers & bulk restocking access' },
    { id: 'reports', label: 'Reports', desc: 'Allow staff to see sales reports' },
    { id: 'staff', label: 'Staff Management', desc: 'Allow managers to view shift logs' },
    { id: 'settings', label: 'Settings', desc: 'Access to business profile & PINs' },
  ];

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ShieldCheck size={24} color="var(--primary)" />
        Staff Access Control
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
        Choose which modules your staff can access. Permissions apply globally to all staff devices.
      </p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {permissionsList.map((perm) => {
          const isEnabled = business?.staffPermissions?.[perm.id] ?? false;
          return (
            <div 
              key={perm.id} 
              onClick={() => onToggle(perm.id)}
              style={{ 
                padding: '20px', 
                borderRadius: '16px', 
                border: '2px solid', 
                borderColor: isEnabled ? 'var(--primary)' : 'var(--border)',
                background: isEnabled ? '#eff6ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: isEnabled ? 'var(--primary)' : 'var(--text)' }}>
                  {perm.label}
                </div>
                <div style={{ 
                  width: '24px', 
                  height: '24px', 
                  borderRadius: '50%', 
                  background: isEnabled ? 'var(--primary)' : 'var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white'
                }}>
                  {isEnabled ? '✓' : ''}
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                {perm.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
