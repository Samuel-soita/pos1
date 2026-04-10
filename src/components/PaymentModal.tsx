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
  const { packages, staffCost, customFeaturesCost, totalMonthly } = useSubscription();
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
      <div className="card glass-card" style={{ maxWidth: '480px', width: '100%', padding: '40px', textAlign: 'center', border: 'none' }}>
        {isSent ? (
          <div className="fade-in">
            <div style={{ width: '80px', height: '80px', background: 'rgba(34, 197, 94, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <CheckCircle size={40} color="#22c55e" />
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '16px' }}>Code Submitted!</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '32px' }}>
              We are verifying your transaction <strong>{mpesaCode}</strong>. Your app will automatically unlock once the payment is confirmed by our engineer.
            </p>
            <button className="btn-primary" onClick={() => setIsSent(false)} style={{ width: '100%' }}>
              Return to Catalog
            </button>
          </div>
        ) : (
          <div className="fade-in">
            <div style={{ width: '80px', height: '80px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Lock size={40} color="#ef4444" />
            </div>
            
            <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '8px' }}>
              {needsDeposit ? 'Activate Business' : 'Subscription Expired'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '32px' }}>
              {needsDeposit 
                ? 'Your 5-day trial has ended. Please pay to continue managing your business.'
                : 'Your monthly subscription has expired. Please renew to resume operations.'}
            </p>

            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '24px', borderRadius: '16px', marginBottom: '32px', textAlign: 'left', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{business?.packageId ? packages[business.packageId as keyof typeof packages]?.name : 'Base'} Package</span>
                <span style={{ fontWeight: 700 }}>
                  KES {(business?.packageId ? (packages[business.packageId as keyof typeof packages]?.price ?? 0) : 0).toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Staff Billing (KES 150/ea)</span>
                <span style={{ fontWeight: 700 }}>KES {staffCost.toLocaleString()}</span>
              </div>
              {customFeaturesCost > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Engineer Add-ons (KES 200/ea)</span>
                  <span style={{ fontWeight: 700 }}>KES {customFeaturesCost.toLocaleString()}</span>
                </div>
              )}
              <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800 }}>Total Due</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)' }}>KES {totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div style={{ textAlign: 'left', marginBottom: '32px' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Payment Instructions</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: 'var(--success)', color: 'white', padding: '12px', borderRadius: '12px' }}>
                  <Smartphone size={24} />
                </div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: '1.25rem', color: '#166534' }}>0768640343</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>SAMUEL SOITA</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="input-group" style={{ textAlign: 'left', marginBottom: '24px' }}>
                <label style={{ fontWeight: 700 }}>Enter M-Pesa Transaction Code</label>
                <input 
                  required 
                  type="text" 
                  placeholder="e.g. QRC7W8X9Y" 
                  value={mpesaCode}
                  onChange={e => setMpesaCode(e.target.value.toUpperCase())}
                  style={{ height: '56px', fontSize: '1.1rem', letterSpacing: '2px', fontWeight: 800 }}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', height: '64px', fontSize: '1.25rem', gap: '12px' }} disabled={isSubmitting}>
                <Send size={22} />
                {isSubmitting ? 'Verifying...' : 'Unlock Now'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
