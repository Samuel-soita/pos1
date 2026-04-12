import React, { useCallback, useMemo } from 'react';
import { db } from '../db/db';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { Check, Sparkles, Zap, Shield, Store, LayoutGrid, Users } from 'lucide-react';

interface Package {
  name: string;
  price: number;
  features: string[];
}

export function PackageSelection({ isEmbedded = false, onComplete }: { isEmbedded?: boolean, onComplete?: () => void }) {
  const { packages, status: subStatus, trialUsed } = useSubscription();
  const { business } = useAuth();

  const handleSelect = useCallback(async (packageId: string) => {
    if (!business || trialUsed) return;
    try {
      // Start a 5-day trial upon selection
      const TRIAL_DAYS = 5;
      const expiryDate = new Date().getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
      await db.businesses.update(business.id, { 
        packageId,
        expiryDate,
        status: 'trial',
        trialUsed: true
      });
      const pkg = (packages as Record<string, Package>)[packageId];
      alert(`${pkg?.name} activated for your one-time 5-day trial!`);
      if (onComplete) {
        onComplete();
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update plan');
    }
  }, [business, packages, onComplete, trialUsed]);

  const icons = useMemo(() => ({
    hustler: <Store size={40} />,
    biashara: <Zap size={40} />,
    boss: <Shield size={40} />
  }), []);

  return (
    <div style={{ paddingBottom: isEmbedded ? '0' : '100px' }}>
      {!isEmbedded && (
        <div style={{ 
          background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #f8fafc 100%)',
          padding: '40px 20px',
          textAlign: 'center',
          borderBottom: '1px solid var(--border)',
          marginBottom: '40px'
        }}>
          <div style={{ 
            maxWidth: '360px', 
            margin: '0 auto 24px', 
            padding: '16px', 
            background: 'white', 
            borderRadius: '20px', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            border: '1px solid var(--border)' 
          }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Active Registration</p>
            <h2 style={{ fontSize: '1.50rem', fontWeight: 900, marginBottom: '4px' }}>{business?.name}</h2>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700 }}>
              <LayoutGrid size={14} color="var(--primary)" />
              Code: {business?.code}
            </div>
          </div>

          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1px', marginBottom: '12px', background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Choose Your Plan
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto' }}>
            Try any plan for <strong style={{ color: 'var(--primary)' }}>5 days for free</strong>.
          </p>
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', 
        gap: '16px', 
        maxWidth: '1100px', 
        margin: '0 auto', 
        padding: isEmbedded ? '0' : '0 16px' 
      }}>
        {Object.entries(packages).map(([id, pkg]) => (
          <div key={id} className={`card ${id === 'biashara' ? 'glass-card' : ''}`} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            padding: '20px',
            border: id === 'biashara' ? '2px solid var(--primary)' : '1px solid var(--border)',
            position: 'relative',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default',
            minHeight: '400px'
          }}>
            {id === 'biashara' && (
              <div style={{ 
                position: 'absolute', 
                top: '-12px', 
                left: '50%', 
                transform: 'translateX(-50%)', 
                background: 'var(--primary)', 
                color: 'white', 
                padding: '2px 12px', 
                borderRadius: '12px', 
                fontSize: '0.65rem', 
                fontWeight: 900, 
                letterSpacing: '0.5px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px',
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
                whiteSpace: 'nowrap'
              }}>
                <Sparkles size={10} /> RECOMMENDED
              </div>
            )}

            <div style={{ color: 'var(--primary)', marginBottom: '16px' }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {icons[id as keyof typeof icons] && React.cloneElement(icons[id as keyof typeof icons] as React.ReactElement<any>, { size: 32 })}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>{pkg.name}</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '12px' }}>
                {id === 'hustler' ? "Sell fast, track money, simple shop" : 
                 id === 'growth' ? "Manage staff, track branches, control expenses" : 
                 "Run your entire business remotely with analytics"}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 900 }}>KES {pkg.price}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem' }}>/mo</span>
              </div>
            </div>

            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px', 
              marginBottom: '20px', 
              borderTop: '1px solid var(--border)', 
              paddingTop: '16px' 
            }}>
              {pkg.features.map((feature: string, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ 
                    width: '18px', 
                    height: '18px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Check size={10} color="var(--primary)" strokeWidth={4} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{feature}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)', marginTop: '2px' }}>
                <Users size={16} />
                <span style={{ fontSize: '0.8rem' }}>KES 150/mo per extra staff</span>
              </div>
            </div>

            <button 
              onClick={() => handleSelect(id)}
              disabled={trialUsed && subStatus !== 'active'}
              className={id === 'growth' ? 'btn-primary' : 'btn-secondary'}
              style={{ 
                width: '100%', 
                height: '48px', 
                fontSize: '1rem', 
                fontWeight: 800, 
                borderRadius: '12px',
                opacity: (trialUsed && subStatus !== 'active') ? 0.6 : 1
              }}
            >
              {subStatus === 'pending_payment' ? "Confirming..." : 
               trialUsed ? (subStatus === 'active' ? "Active Plan" : "Contact Engineer") : 
               "Start 5-Day Trial"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
