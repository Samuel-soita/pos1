import { useCallback, useMemo } from 'react';
import { db } from '../db/db';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { Check, Sparkles, Zap, Shield, Store, LayoutGrid, Users } from 'lucide-react';

export function PackageSelection() {
  const { packages } = useSubscription();
  const { business } = useAuth();

  const handleSelect = useCallback(async (packageId: 'hustler' | 'biashara' | 'boss') => {
    if (!business) return;
    try {
      // Start a 5-day trial upon selection
      const TRIAL_DAYS = 5;
      const expiryDate = new Date().getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
      await db.businesses.update(business.id, { 
        packageId,
        expiryDate 
      });
      alert(`${packages[packageId].name} activated for a 5-day trial!`);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Failed to update plan');
    }
  }, [business, packages]);

  const icons = useMemo(() => ({
    hustler: <Store size={40} />,
    biashara: <Zap size={40} />,
    boss: <Shield size={40} />
  }), []);

  return (
    <div style={{ paddingBottom: '100px' }}>
      {/* Business Header Section */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #f8fafc 100%)',
        padding: '60px 20px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border)',
        marginBottom: '60px'
      }}>
        <div style={{ 
          maxWidth: '400px', 
          margin: '0 auto 32px', 
          padding: '24px', 
          background: 'white', 
          borderRadius: '24px', 
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
          border: '1px solid var(--border)' 
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Active Registration</p>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '4px' }}>{business?.name}</h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', padding: '6px 16px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700 }}>
            <LayoutGrid size={16} color="var(--primary)" />
            Code: {business?.code}
          </div>
        </div>

        <h1 style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-1.5px', marginBottom: '16px', background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Choose Your Trial Plan
        </h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
          Test any plan for <strong style={{ color: 'var(--primary)' }}>5 days for free</strong>. Scale up or down anytime.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '40px', maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        {Object.entries(packages).map(([id, pkg]) => (
          <div key={id} className={`card ${id === 'biashara' ? 'glass-card' : ''}`} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            padding: '48px',
            border: id === 'biashara' ? '2.5px solid var(--primary)' : '1px solid var(--border)',
            position: 'relative',
            transform: id === 'biashara' ? 'scale(1.05)' : 'none',
            zIndex: id === 'biashara' ? 2 : 1,
            boxShadow: id === 'biashara' ? '0 30px 50px -12px rgba(37, 99, 235, 0.25)' : 'none'
          }}>
            {id === 'biashara' && (
              <div style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary)', color: 'white', padding: '8px 24px', borderRadius: '30px', fontSize: '0.85rem', fontWeight: 900, letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} /> MOST RELATABLE
              </div>
            )}

            <div style={{ color: 'var(--primary)', marginBottom: '32px' }}>
              {icons[id as keyof typeof icons]}
            </div>

            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '12px' }}>{pkg.name}</h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '3rem', fontWeight: 900 }}>KES {pkg.price}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>/mo</span>
              </div>
              <p style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem', marginTop: '12px', background: 'rgba(37, 99, 235, 0.1)', display: 'inline-block', padding: '4px 12px', borderRadius: '8px' }}>
                5 Days Free Trial
              </p>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '48px', borderTop: '1px solid var(--border)', paddingTop: '32px' }}>
              {pkg.features.map((feature: string, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', background: 'var(--bg-secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={14} color="var(--primary)" strokeWidth={4} />
                  </div>
                  <span style={{ fontWeight: 600 }}>{feature}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-muted)' }}>
                <Users size={20} />
                <span style={{ fontSize: '0.9rem' }}>KES 150/mo per extra staff</span>
              </div>
            </div>

            <button 
              onClick={() => handleSelect(id as 'hustler' | 'biashara' | 'boss')}
              className={id === 'biashara' ? 'btn-primary' : 'btn-secondary'}
              style={{ width: '100%', height: '64px', fontSize: '1.2rem', fontWeight: 800, borderRadius: '16px' }}
            >
              Start Trial
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
