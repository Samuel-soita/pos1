import { useState } from 'react';
import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { Lock, Smartphone, Send, CheckCircle } from 'lucide-react';
import { type SubscriptionStatus, useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';

interface PaymentModalProps {
  status: SubscriptionStatus;
  needsDeposit: boolean;
}

export function PaymentModal({ status, needsDeposit }: PaymentModalProps) {
  const { packages, staffCost, totalMonthly } = useSubscription();
  const { business } = useAuth();
  
  const [mpesaCode, setMpesaCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Calculate current amount due
  const totalAmount = totalMonthly;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mpesaCode.trim() || !business) return;

    setIsSubmitting(true);
    try {
      // Add to sync queue for backend verification
      await db.sync_queue.add({
        id: uuidv4(),
        action: 'VERIFY_PAYMENT',
        table: 'businesses',
        payload: { 
          businessId: business.id,
          mpesaCode: mpesaCode.toUpperCase().trim(),
          type: needsDeposit ? 'ACTIVATION' : 'SUBSCRIPTION',
          amount: totalAmount
        },
        timestamp: Date.now(),
        status: 'pending',
        errorCount: 0
      });

      // Simulation: For the engineer/demo, we'll auto-advance the date if code is "0000"
      if (mpesaCode === '0000') {
        const newExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
        await db.businesses.update(business.id, { expiryDate: newExpiry });
        alert('Payment Verified (Technical Override)!');
        window.location.reload();
      }

      setIsSent(true);
      setMpesaCode('');
    } catch (err) {
      console.error('Failed to submit M-Pesa code:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status !== 'locked' && !isSent) return null;

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      background: 'rgba(15, 23, 42, 0.9)', 
      backdropFilter: 'blur(10px)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 9999,
      padding: '20px'
    }}>
      <div className="card glass-card" style={{ maxWidth: '440px', width: '100%', padding: 'min(24px, 6vw)', textAlign: 'center', border: 'none' }}>
        {isSent ? (
          <div className="fade-in">
            <div style={{ width: '48px', height: '48px', background: 'rgba(34, 197, 94, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={24} color="#22c55e" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>Code Submitted!</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '20px', fontSize: '0.85rem' }}>
              Verifying transaction <strong>{mpesaCode}</strong>. Your app will unlock once confirmed.
            </p>
            <button className="btn-primary" onClick={() => setIsSent(false)} style={{ width: '100%', height: '44px' }}>
              Return to Catalog
            </button>
          </div>
        ) : (
          <div className="fade-in">
            <div style={{ width: '48px', height: '48px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Lock size={24} color="#ef4444" />
            </div>
            
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '4px' }}>
              {needsDeposit ? 'Activate Business' : 'Subscription Expired'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '16px' }}>
              {needsDeposit 
                ? 'Your trial has ended. Please pay to continue.'
                : 'Your monthly subscription has expired.'}
            </p>

            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', borderRadius: '12px', marginBottom: '16px', textAlign: 'left', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{business?.packageId ? packages[business.packageId as keyof typeof packages]?.name : 'Base'} Package</span>
                <span style={{ fontWeight: 700 }}>
                  KES {(business?.packageId ? (packages[business.packageId as keyof typeof packages]?.price ?? 0) : 0).toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Staff Billing</span>
                <span style={{ fontWeight: 700 }}>KES {staffCost.toLocaleString()}</span>
              </div>
              
              <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '10px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Total Due</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--primary)' }}>KES {totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment Instructions</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'var(--success)', color: 'white', padding: '8px', borderRadius: '8px' }}>
                  <Smartphone size={16} />
                </div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: '1rem', color: '#166534', margin: 0 }}>0768640343</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>SAMUEL SOITA</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="input-group" style={{ textAlign: 'left', marginBottom: '16px' }}>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Enter M-Pesa Transaction Code</label>
                <input 
                  required 
                  type="text" 
                  placeholder="e.g. QRC7W8X9Y" 
                  value={mpesaCode}
                  onChange={e => setMpesaCode(e.target.value.toUpperCase())}
                  style={{ height: '48px', fontSize: '1rem', letterSpacing: '1px', fontWeight: 800 }}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', height: '52px', fontSize: '1rem', gap: '8px' }} disabled={isSubmitting}>
                <Send size={18} />
                {isSubmitting ? 'Verifying...' : 'Unlock Now'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
