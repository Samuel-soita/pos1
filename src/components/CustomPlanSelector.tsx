import React from 'react';
import { db } from '../db/db';
import { useSubscription, MODULAR_FEATURES } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { 
  Check, Sparkles, Building2, 
  ChevronRight, Calculator,
  Package, GitMerge, Clock, BarChart3, Download, Printer
} from 'lucide-react';
import { MpesaPaymentFlow } from './MpesaPaymentFlow';

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  inventory_alerts: <Package size={20} />,
  branch_management: <GitMerge size={20} />,
  shift_tracking: <Clock size={20} />,
  advanced_analytics: <BarChart3 size={20} />,
  excel_exports: <Download size={20} />,
  receipt_customization: <Printer size={20} />
};

export function CustomPlanSelector({ onComplete }: { onComplete?: () => void }) {
  const { business } = useAuth();
  const { 
    packages, 
    totalMonthly, 
    staffCount, 
    staffCost,
    toggleFeature, 
    updatePlan,
    enabledFeatures 
  } = useSubscription();

  const [showPayment, setShowPayment] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const currentPackageId = business?.packageId || 'custom';
  const basePrice = (packages as Record<string, { price: number }>)[currentPackageId]?.price || 0;

  const handleBaseSelect = async (id: string) => {
    await updatePlan(id);
  };

  const handleConfirm = async () => {
    if (!business) return;
    try {
      if (!business.trialUsed) {
        const TRIAL_DAYS = 5;
        const expiryDate = new Date().getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
        await db.businesses.update(business.id, { 
          expiryDate,
          status: 'trial',
          trialUsed: true
        });
        alert('Plan confirmed and 5-day trial activated!');
        if (onComplete) onComplete();
        else window.location.reload();
      } else {
        setShowPayment(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save plan');
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px', maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        
        {/* Step 1: Base Plan */}
        <section>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--primary)', color: 'white', padding: '6px', borderRadius: '8px' }}><Building2 size={18} /></div>
            1. Select Your Base Foundation
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {Object.entries(packages).map(([id, pkg]) => (
              <div 
                key={id}
                onClick={() => handleBaseSelect(id)}
                style={{
                  padding: '20px',
                  borderRadius: '16px',
                  border: `2px solid ${currentPackageId === id ? 'var(--primary)' : 'var(--border)'}`,
                  background: currentPackageId === id ? 'rgba(37, 99, 235, 0.03)' : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {currentPackageId === id && (
                  <div style={{ position: 'absolute', top: '12px', right: '12px', color: 'var(--primary)' }}>
                    <Check size={20} strokeWidth={3} />
                  </div>
                )}
                <h4 style={{ fontWeight: 800, marginBottom: '4px' }}>{pkg.name}</h4>
                <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>
                  KES {pkg.price.toLocaleString()}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>/mo</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Step 2: Modular Features */}
        <section>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--success)', color: 'white', padding: '6px', borderRadius: '8px' }}><Sparkles size={18} /></div>
            2. Add Premium Capabilities
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(MODULAR_FEATURES).map(([id, feat]) => {
              const isEnabled = enabledFeatures.includes(id);
              return (
                <div 
                  key={id}
                  onClick={() => toggleFeature(id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    background: isEnabled ? 'rgba(16, 185, 129, 0.03)' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '12px', 
                    background: isEnabled ? 'var(--success)' : 'var(--bg-secondary)', 
                    color: isEnabled ? 'white' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {FEATURE_ICONS[id]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>{feat.name}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{feat.desc}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: '1rem', color: isEnabled ? 'var(--success)' : 'var(--text)' }}>
                      + KES {feat.price}
                    </div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: isEnabled ? 'var(--success)' : 'var(--text-muted)' }}>
                      {isEnabled ? 'Enabled' : 'Monthly'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Sidebar: Summary */}
      <aside style={{ position: 'sticky', top: '100px', height: 'fit-content' }}>
        <div style={{ 
          background: 'white', 
          borderRadius: '24px', 
          padding: '32px', 
          border: '1px solid var(--border)', 
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' 
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calculator size={20} color="var(--primary)" />
            Plan Summary
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Base Foundation ({currentPackageId})</span>
              <span style={{ fontWeight: 800 }}>KES {basePrice.toLocaleString()}</span>
            </div>
            
            {staffCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Staff Slots ({staffCount})</span>
                <span style={{ fontWeight: 800 }}>KES {staffCost.toLocaleString()}</span>
              </div>
            )}

            {enabledFeatures.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '12px' }}>Custom Add-ons</p>
                {enabledFeatures.map(id => {
                  const feat = (MODULAR_FEATURES as Record<string, { name: string, price: number }>)[id];
                  return (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600 }}>{feat?.name}</span>
                      <span style={{ fontWeight: 800 }}>KES {feat?.price}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '16px', marginBottom: '32px' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>Total Monthly Subscription</p>
            <div style={{ fontSize: '2.25rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px' }}>
              KES {totalMonthly.toLocaleString()}
            </div>
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '16px' }}>{error}</p>}

          {!showPayment && (
            <button 
              onClick={handleConfirm}
              style={{
                width: '100%',
                background: 'var(--primary)',
                color: 'white',
                padding: '16px',
                borderRadius: '12px',
                fontSize: '1.1rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)'
              }}
            >
              Confirm & Activate <ChevronRight size={20} />
            </button>
          )}

          {showPayment && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
              <div style={{ maxWidth: '400px', width: '100%' }}>
                <MpesaPaymentFlow 
                  amount={totalMonthly} 
                  onSuccess={() => {
                    setShowPayment(false);
                    if (onComplete) onComplete();
                    else window.location.reload();
                  }}
                  onCancel={() => setShowPayment(false)}
                />
              </div>
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '20px', fontWeight: 500 }}>
            Change your customization at any time. Changes reflect on your next billing cycle.
          </p>
        </div>
      </aside>
    </div>
  );
}
