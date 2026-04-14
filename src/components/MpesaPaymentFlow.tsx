import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { useAuth } from '../hooks/useAuth';
import { Smartphone, Loader2, CheckCircle2, AlertCircle, RefreshCcw, Banknote } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MpesaPaymentFlowProps {
  amount: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function MpesaPaymentFlow({ amount, onSuccess, onCancel }: MpesaPaymentFlowProps) {
  const { business } = useAuth();
  const PLATFORM_FEE = 10;
  const totalWithFee = amount + PLATFORM_FEE;
  
  const [paymentMode, setPaymentMode] = useState<'selection' | 'stk_push' | 'manual'>('selection');
  
  const [phoneNumber, setPhoneNumber] = useState(business?.telephone || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'waiting' | 'verifying' | 'success' | 'failed'>('idle');

  useEffect(() => {
    if (pollingStatus !== 'waiting' && pollingStatus !== 'verifying') return;

    const interval = setInterval(async () => {
      if (!business?.id) return;
      const updatedBiz = await db.businesses.get(business.id);
      if (updatedBiz?.status === 'active' || updatedBiz?.status === 'trial') {
        setPollingStatus('success');
        clearInterval(interval);
        setTimeout(() => onSuccess?.(), 2000);
      }
    }, 3000);

    const timeout = setTimeout(() => {
      if (pollingStatus === 'waiting' || pollingStatus === 'verifying') {
        setError("Payment verification timed out. If you paid, it will reflect shortly.");
        setPollingStatus('failed');
      }
    }, 120000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pollingStatus, business?.id, onSuccess]);

  const handleInitiatePayment = async () => {
    if (!business || !phoneNumber) return;
    
    setIsProcessing(true);
    setError(null);
    setPollingStatus('waiting');

    try {
      // Phase 4 Hardening: Phone Normalization (Ensures Safaricom 254... format)
      let normalizedPhone = phoneNumber.replace(/\D/g, ''); // Remove non-digits
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '254' + normalizedPhone.substring(1);
      } else if (normalizedPhone.startsWith('7') || normalizedPhone.startsWith('1')) {
        normalizedPhone = '254' + normalizedPhone;
      }

      if (normalizedPhone.length !== 12) {
        throw new Error("Invalid Kenyan phone number. Please use 254XXXXXXXXX format.");
      }

      const { data, error: funcError } = await supabase.functions.invoke('mpesa-stk-push', {
        body: {
          businessId: business.id,
          phone: normalizedPhone,
          amount: totalWithFee,
          paymentType: business.trialUsed ? 'renewal' : 'activation'
        }
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initiate M-Pesa payment');
      setPollingStatus('failed');
      setIsProcessing(false);
    }
  };

  if (pollingStatus === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <CheckCircle2 size={64} color="var(--success)" style={{ margin: '0 auto 20px' }} />
        <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '8px' }}>Payment Successful!</h3>
        <p style={{ color: 'var(--text-muted)' }}>Welcome to the Pro Tier. Your account is now active.</p>
      </div>
    );
  }

  // selection screen
  if (paymentMode === 'selection') {
     return (
       <div style={{ padding: '24px', background: 'white', borderRadius: '24px', border: '1px solid var(--border)' }}>
         <h3 style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '8px' }}>Choose Payment Method</h3>
         <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>How would you like to pay KES {totalWithFee.toLocaleString()}?</p>
         
         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
           <button 
             className="btn-primary" 
             onClick={() => setPaymentMode('stk_push')}
             style={{ justifyContent: 'flex-start', padding: '16px', gap: '16px', height: 'auto' }}
           >
             <Smartphone size={24} />
             <div style={{ textAlign: 'left' }}>
               <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>M-Pesa Express (STK Push)</div>
               <div style={{ fontWeight: 400, fontSize: '0.85rem', opacity: 0.9 }}>Get a prompt directly on your phone</div>
             </div>
           </button>

           <button 
             className="btn-secondary" 
             onClick={() => setPaymentMode('manual')}
             style={{ justifyContent: 'flex-start', padding: '16px', gap: '16px', height: 'auto', background: '#f8fafc' }}
           >
             <Banknote size={24} color="var(--primary)" />
             <div style={{ textAlign: 'left' }}>
               <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text)' }}>Manual Payment (Paybill)</div>
               <div style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Send money directly and notify us</div>
             </div>
           </button>

           <button className="btn-secondary" onClick={onCancel} style={{ marginTop: '12px' }}>
             Cancel
           </button>
         </div>
       </div>
     );
  }

  if (paymentMode === 'manual') {
    return (
      <div style={{ padding: '24px', background: 'white', borderRadius: '24px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ background: '#22c55e', color: 'white', padding: '8px', borderRadius: '10px' }}>
            <Banknote size={20} />
          </div>
          <div>
            <h3 style={{ fontWeight: 800, fontSize: '1.1rem' }}>Manual Payment Activation</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pay via Paybill / Till Number</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '16px', border: '1px solid #dcfce7', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: '8px' }}>Amount Due</p>
            <p style={{ fontSize: '2rem', fontWeight: 900, color: '#15803d', marginBottom: '12px' }}>KES {totalWithFee.toLocaleString()}</p>
            <p style={{ color: '#166534', fontSize: '0.9rem' }}>Please send this exact amount via M-Pesa to:</p>
            <div style={{ marginTop: '12px', padding: '12px', background: 'white', borderRadius: '12px', display: 'inline-block', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
               <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Send Money to</p>
               <p style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '2px', color: 'var(--text)' }}>0768640343</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
            <AlertCircle size={24} color="#1d4ed8" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '0.9rem', color: '#1e3a8a', lineHeight: 1.5 }}>
              <strong>After making the payment:</strong><br/> 
              Send your M-Pesa confirmation message to our support line at <strong>0768640343</strong> via WhatsApp. Your pos will be activated immediately upon verification.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={() => setPaymentMode('selection')} style={{ flex: 1 }}>Back</button>
            <button className="btn-secondary" onClick={onCancel} style={{ flex: 1 }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // STK Push flow
  return (
    <div style={{ padding: '24px', background: 'white', borderRadius: '24px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: '#22c55e', color: 'white', padding: '8px', borderRadius: '10px' }}>
          <Smartphone size={20} />
        </div>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: '1.1rem' }}>M-Pesa Express</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Secure STK Push Payment</p>
        </div>
      </div>

      {pollingStatus === 'waiting' ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Loader2 size={40} color="var(--primary)" className="animate-spin" style={{ margin: '0 auto 16px' }} />
          <p style={{ fontWeight: 700, marginBottom: '4px' }}>Request Sent!</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Please check your phone and enter your M-Pesa PIN for KES {totalWithFee.toLocaleString()}.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="input-group">
            <label>M-Pesa Phone Number</label>
            <input 
              type="text" 
              value={phoneNumber} 
              onChange={(e) => setPhoneNumber(e.target.value)} 
              placeholder="2547XXXXXXXX"
              disabled={isProcessing}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Format: 254712345678</span>
          </div>

          {error && (
            <div style={{ display: 'flex', gap: '8px', padding: '12px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <p>{error}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn-primary" 
              style={{ flex: 1 }}
              onClick={handleInitiatePayment}
              disabled={isProcessing || !phoneNumber}
            >
              Pay KES {totalWithFee.toLocaleString()}
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => setPaymentMode('selection')}
              disabled={isProcessing}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {pollingStatus === 'failed' && (
        <button 
          className="btn-secondary" 
          onClick={() => { setPollingStatus('idle'); setIsProcessing(false); }}
          style={{ width: '100%', marginTop: '12px', gap: '8px' }}
        >
          <RefreshCcw size={16} /> Try Again
        </button>
      )}
    </div>
  );
}
