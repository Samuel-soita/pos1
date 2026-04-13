import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../db/db';
import { useAuth } from '../hooks/useAuth';
import { Smartphone, Loader2, CheckCircle2, AlertCircle, RefreshCcw } from 'lucide-react';

interface MpesaPaymentFlowProps {
  amount: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function MpesaPaymentFlow({ amount, onSuccess, onCancel }: MpesaPaymentFlowProps) {
  const { business } = useAuth();
  const PLATFORM_FEE = 10; // Fixed fee to cover Daraja API costs
  const totalWithFee = amount + PLATFORM_FEE;
  // const { status: currentStatus } = useSubscription();
  const [phoneNumber, setPhoneNumber] = useState(business?.telephone || '');
  const [isProcessing, setIsProcessing] = useState(false);
  // const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'waiting' | 'verifying' | 'success' | 'failed'>('idle');

  // Poll for the business status changes in the local DB (synced from cloud)
  useEffect(() => {
    if (pollingStatus !== 'waiting' && pollingStatus !== 'verifying') return;

    const interval = setInterval(async () => {
      if (!business?.id) return;
      
      // We check the local 'businesses' table which is updated by useSync
      const updatedBiz = await db.businesses.get(business.id);
      if (updatedBiz?.status === 'active' || updatedBiz?.status === 'trial') {
        setPollingStatus('success');
        clearInterval(interval);
        setTimeout(() => onSuccess?.(), 2000);
      }
    }, 3000);

    // Timeout after 2 minutes
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
      const PLATFORM_FEE = 10;
      const finalAmount = Math.round(Number(amount) + PLATFORM_FEE);

      const { data, error: funcError } = await supabase.functions.invoke('mpesa-stk-push', {
        body: {
          businessId: business.id,
          phone: phoneNumber,
          amount: finalAmount,
          paymentType: business.trialUsed ? 'renewal' : 'activation'
        }
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error);

      // setCheckoutId(data.checkoutRequestId);
      // Stay in 'waiting' state while we poll for DB changes
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

  return (
    <div style={{ padding: '24px', background: 'white', borderRadius: '24px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: '#22c55e', color: 'white', padding: '8px', borderRadius: '10px' }}>
          <Smartphone size={20} />
        </div>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: '1.1rem' }}>M-Pesa Express Activation</h3>
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
              onClick={handleInitiatePayment}
              disabled={isProcessing || !phoneNumber}
              style={{ flex: 1 }}
            >
              {isProcessing ? 'Waiting for PIN...' : `Pay KES ${totalWithFee.toLocaleString()}`}
            </button>
            <button 
              className="btn-secondary" 
              onClick={onCancel}
              disabled={isProcessing}
            >
              Cancel
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
