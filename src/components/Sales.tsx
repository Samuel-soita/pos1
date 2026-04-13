import { useState, useEffect, useRef, useCallback } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';

import { Search, ShoppingCart, Trash2, Plus, Minus, CheckCircle, X, Banknote, Smartphone, History as HistoryIcon, ArrowLeft, Printer, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type Sale } from '../db/db';
import { usePrinter } from '../hooks/usePrinter';
import { BarcodeScanner } from './BarcodeScanner';
import { History } from './History';
import { useSyncStatus } from '../hooks/useSync';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { playChime, playBeep } from '../utils/audio';

export function Sales() {
  const { products } = useInventory();
  const { cart, addToCart, removeFromCart, updateCartQuantity, completeSale, cartTotal } = useSales();

  const { business, businessId } = useAuth();
  
  const [view, setView] = useState<'pos' | 'history'>('pos');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [mpesaCode, setMpesaCode] = useState('');
  const [activeCheckoutId, setActiveCheckoutId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'M-Pesa'>('Cash');
  const { printReceipt } = usePrinter();
  const { status: subStatus, limitReached, message: subMessage } = useSubscription();
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isOnline, pendingCount } = useSyncStatus();
  
  // M-Pesa Automation State
  const [mpesaConfig, setMpesaConfig] = useState<{ is_enabled: boolean, convenience_fee: number } | null>(null);
  const [isAutomatingMpesa, setIsAutomatingMpesa] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState(business?.telephone || '');
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'waiting' | 'verifying' | 'success' | 'failed'>('idle');
  const [automatedError, setAutomatedError] = useState<string | null>(null);
  
  // Sensory States
  const [glowingProductId, setGlowingProductId] = useState<string | null>(null);
  const [triggerTotalPulse, setTriggerTotalPulse] = useState(false);
  const [cashAmount, setCashAmount] = useState<string>('');
  const { staff } = useAuth();


  // Speed Optimization: Auto-focus search on mount/view change
  useEffect(() => {
    if (view === 'pos') {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [view]);

  // Load M-Pesa Config if online
  useEffect(() => {
    if (businessId) {
      import('../lib/supabase').then(({ supabase }) => {
        supabase
          .from('business_mpesa_configs')
          .select('is_enabled, convenience_fee')
          .eq('business_id', businessId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setMpesaConfig(data);
          });
      });
    }
  }, [businessId]);

  // Speed Optimization: Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchTerm('');
        searchInputRef.current?.focus();
      }
      if (e.key === 'Enter' && cart.length > 0 && !showCheckoutModal && !showSuccess) {
        setShowCheckoutModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, showCheckoutModal, showSuccess]);


  const taxRateSetting = useLiveQuery(() => db.settings.get('tax_rate'));
  const taxRate = typeof taxRateSetting?.value === 'number' ? taxRateSetting.value : 0;

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category || 'General'))).sort()];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.barcode && p.barcode.includes(searchTerm));
    const matchesCategory = selectedCategory === 'All' || (p.category || 'General') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const triggerSensoryFeedback = useCallback((productId: string) => {
    playChime();
    setGlowingProductId(productId);
    setTriggerTotalPulse(true);
    setTimeout(() => {
      setGlowingProductId(null);
      setTriggerTotalPulse(false);
    }, 400);
  }, []);

  const handleScanProduct = useCallback((product: Product, customPrice?: number) => {
    const productWithPrice = { ...product, price: customPrice ?? product.price };
    triggerSensoryFeedback(product.id!);
    addToCart(productWithPrice);
  }, [addToCart, triggerSensoryFeedback]);

  // Hardware Barcode Scanner Support - Memoized to prevent effect re-runs
  const handleHardwareScan = useCallback(async (barcode: string) => {
    const product = await db.products.where('barcode').equals(barcode).first();
    if (product) {
      if (product.quantity > 0) {
        handleScanProduct(product);
        playBeep(); // Distinct professional beep for hardware scanner
      } else {
        alert(`Product ${product.name} is out of stock!`);
      }
    } else {
      console.warn("Unknown barcode scanned:", barcode);
    }
  }, [handleScanProduct]);

  const executePayment = useCallback(async (method: string, autoCode?: string) => {
    if (limitReached) {
      alert("Emergency Sales Limit Reached. Please renew your subscription to continue.");
      return;
    }

    const taxAmount = cartTotal - (cartTotal / (1 + (taxRate / 100))); 
    const currentCart = [...cart];
    const finalCode = autoCode || mpesaCode;
    const result = await completeSale(taxRate, taxAmount, method, method === 'M-Pesa' ? finalCode : undefined);
    
    if (result?.success) {
      // If suspended, increment the emergency counter
      if (subStatus === 'suspended') {
        const bus = await db.businesses.get(businessId || '');
        if (bus) {
          await db.businesses.update(bus.id, { 
            suspendedRevenueCount: (bus.suspendedRevenueCount || 0) + 1 
          });
        }
      }

      setShowCheckoutModal(false);
      setShowSuccess(true);
      setMpesaCode('');
      setPollingStatus('idle');
      setIsAutomatingMpesa(false);
      
      const saleToPrint = {
        id: result.receiptId,
        businessId: businessId || '',
        receiptId: result.receiptId,
        total: cartTotal,
        totalProfit: 0,
        timestamp: Date.now(),
        items: currentCart.map(item => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          costPrice: item.costPrice || 0
        })),
        taxRate,
        taxAmount,
        paymentMethod: method,
        transactionCode: method === 'M-Pesa' ? finalCode : undefined,
        deviceId: '',
      };
      
      // AUTO-PRINT Logic: Print receipt immediately without manual intervention
      try {
        setLastSale(saleToPrint as Sale);
        if (business) {
          console.log("[POS] Auto-printing receipt for customer...");
          await printReceipt(saleToPrint as Sale, business);
        }
      } catch (e) {
        console.warn("Printer failed, but sale recorded:", e);
      }
    }
  }, [limitReached, cartTotal, taxRate, cart, mpesaCode, completeSale, subStatus, businessId, setShowCheckoutModal, setShowSuccess, setMpesaCode, setPollingStatus, setIsAutomatingMpesa, business, printReceipt]);

  useHardwareScanner(handleHardwareScan);

  // Polling for Sale Success via M-Pesa
  useEffect(() => {
    if (pollingStatus !== 'waiting' && pollingStatus !== 'verifying' || !activeCheckoutId) return;

    const interval = setInterval(async () => {
       const { supabase: supabaseClient } = await import('../lib/supabase');
        const { data: payments, error: pollError } = await supabaseClient
          .from('payment_requests')
          .select('status, mpesa_code')
          .eq('checkout_request_id', activeCheckoutId)
          .eq('status', 'success')
          .limit(1);

        if (pollError) {
          console.error("[M-Pesa Poll] Database query failed:", pollError);
        }

        if (payments && payments.length > 0) {
          setMpesaCode(payments[0].mpesa_code);
          setPollingStatus('success');
          clearInterval(interval);
          // Execute the final sale recording
          setTimeout(() => executePayment('M-Pesa', payments[0].mpesa_code), 500);
        }
    }, 3000);

    return () => clearInterval(interval);
  }, [pollingStatus, businessId, activeCheckoutId, executePayment]);

  const initiateStkPush = async () => {
    if (!businessId || !mpesaPhone) return;
    setIsAutomatingMpesa(true);
    setAutomatedError(null);
    setPollingStatus('waiting');

    try {
      const { supabase } = await import('../lib/supabase');
      const { data, error: funcError } = await supabase.functions.invoke('customer-stk-push', {
        body: {
          businessId,
          phone: mpesaPhone,
          amount: cartTotal,
          saleId: crypto.randomUUID()
        }
      });

      if (funcError) {
        console.error("[STK Push] Function invocation error:", funcError);
        throw funcError;
      }
      
      if (data.error) {
        console.error("[STK Push] Function logic error:", data.error);
        if (data.stack) console.error("[STK Push] Stack Trace:", data.stack);
        throw new Error(data.error);
      }

      if (data.checkoutRequestId) {
        setActiveCheckoutId(data.checkoutRequestId);
      }

    } catch (err: unknown) {
      setAutomatedError(err instanceof Error ? err.message : String(err));
      setPollingStatus('failed');
      setIsAutomatingMpesa(false);
    }
  };

  if (view === 'history') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <button 
          onClick={() => setView('pos')} 
          className="btn-secondary" 
          style={{ width: 'fit-content', padding: '8px 16px', minHeight: 'auto', gap: '8px' }}
        >
          <ArrowLeft size={18} /> Back to Register
        </button>
        <History />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {subStatus !== 'active' && subStatus !== 'trial' && (
        <div style={{ 
          background: subStatus === 'suspended' ? '#fef2f2' : '#fffbeb', 
          border: `1px solid ${subStatus === 'suspended' ? '#fee2e2' : '#fef3c7'}`,
          padding: '10px 16px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: subStatus === 'suspended' ? '#991b1b' : '#92400e',
          fontSize: '0.9rem',
          fontWeight: 600
        }}>
          <Sparkles size={18} />
          {subMessage}
        </div>
      )}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn-primary" 
            style={{ padding: '8px 16px', minHeight: '40px', fontSize: '0.9rem' }}
          >
            New Sale
          </button>
          <button 
            onClick={() => setView('history')}
            className="btn-secondary" 
            style={{ padding: '8px 16px', minHeight: '40px', fontSize: '0.9rem', gap: '8px' }}
          >
            <HistoryIcon size={18} /> Daily History
          </button>
        </div>
      </header>

      <div className="pos-grid">
      {/* Product Catalog */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Category Pills */}
        <div className="no-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {categories.map(cat => (
            <button 
              key={cat} 
              onClick={() => setSelectedCategory(cat)}
              className={selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}
              style={{ 
                whiteSpace: 'nowrap', 
                padding: '6px 14px', 
                borderRadius: '16px', 
                fontSize: '0.85rem',
                minHeight: '36px' 
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} size={18} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search or Scan products..." 
              style={{ paddingLeft: '40px', minHeight: '44px', fontSize: '1rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={() => setShowScanner(true)}
            style={{ width: 'auto', padding: '0 16px', height: '44px' }}
          >
            <Smartphone size={18} /> <span className="desktop-only">Scan</span>
          </button>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', 
          gap: '12px', 
          overflowY: 'auto', 
          paddingBottom: '24px' 
        }}>
          {filteredProducts.map(product => (
            <div 
              key={product.id} 
              className={`product-card ${glowingProductId === product.id ? 'item-glow-trigger' : ''}`} 
              onClick={() => {
                if (product.quantity > 0) {
                  triggerSensoryFeedback(product.id!);
                  addToCart(product);
                }
              }} 
              style={{ 
                cursor: product.quantity > 0 ? 'pointer' : 'not-allowed', 
                opacity: product.quantity > 0 ? 1 : 0.6,
                padding: '12px',
                background: product.quantity <= product.lowStockThreshold ? '#fff1f1' : 'var(--card)',
                borderColor: product.quantity <= product.lowStockThreshold ? '#fee2e2' : 'var(--border)'
              }}
            >
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2px' }}>{product.name}</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1rem' }}>KES {product.price.toLocaleString()}</div>
              <div className={`stock-badge ${product.quantity <= product.lowStockThreshold ? 'stock-low' : 'stock-ok'}`} 
                style={{ 
                  marginTop: '6px', 
                  fontSize: '0.7rem', 
                  fontWeight: 800,
                  border: product.quantity <= product.lowStockThreshold ? '1px solid var(--danger)' : 'none',
                  animation: product.quantity <= product.lowStockThreshold ? 'pulse 2s infinite' : 'none'
                }}>
                Stock: {product.quantity}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', marginBottom: '20px' }} id="cart-panel">
        <h2 style={{ marginBottom: '16px', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShoppingCart size={20} />
          Cart ({cart.length})
        </h2>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', minHeight: cart.length > 0 ? '200px' : 'auto' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Cart is empty. Select products.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>KES {(item.price).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'white' }}>
                      <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, item.quantity - 1); }} style={{ padding: '2px 6px', borderRadius: 0, background: 'transparent', minHeight: '32px' }}><Minus size={12} /></button>
                      <span style={{ padding: '0 6px', fontWeight: 600, fontSize: '0.85rem' }}>{item.quantity}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, item.quantity + 1); }} style={{ padding: '2px 6px', borderRadius: 0, background: 'transparent', minHeight: '32px' }}><Plus size={12} /></button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }} style={{ color: 'var(--danger)', padding: '6px', background: 'transparent', minHeight: '32px' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>
            <span>Total</span>
            <span className={triggerTotalPulse ? 'total-pulse-trigger' : ''}>KES {cartTotal.toLocaleString()}</span>
          </div>
          
          <button 
            className="btn-primary" 
            style={{ width: '100%', height: '52px', fontSize: '1.1rem' }}
            disabled={cart.length === 0 || limitReached}
            onClick={() => setShowCheckoutModal(true)}
          >
            Complete Checkout
          </button>
        </div>
      </div>

      {/* Success Modal with Hardware Fallback */}
      {showSuccess && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card modal-responsive" style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', background: 'var(--success)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)' }}>
              <CheckCircle color="white" size={48} />
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Sale has been recorded and inventory updated.</p>

            <div className="confidence-strip" style={{ marginBottom: '32px', borderRadius: '12px' }}>
              <div className="confidence-item">
                <span className="confidence-check">✔</span> Stock
              </div>
              <div className="confidence-item">
                <span className="confidence-check">✔</span> Saved
              </div>
              <div className="confidence-item">
                {isOnline && pendingCount === 0 ? (
                  <><span className="confidence-check">✔</span> Cloud</>
                ) : (
                  <><span style={{ color: 'var(--warning)' }}>⏳</span> Pending</>
                )}
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className="btn-secondary" 
                style={{ width: '100%', gap: '8px' }}
                onClick={async () => {
                  if (lastSale && business) {
                    await printReceipt(lastSale, business);
                  }
                }}
              >
                <Printer size={20} /> Print Receipt Again
              </button>
              <button 
                className="btn-primary" 
                style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
                onClick={() => {
                  setShowSuccess(false);
                  // Cart is already cleared by completeSale
                }}
              >
                Start Next Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Checkout Button for Mobile */}
      {cart.length > 0 && !showCheckoutModal && (
        <div className="mobile-only" style={{ 
          position: 'fixed', 
          bottom: '80px', 
          left: '16px', 
          right: '16px', 
          zIndex: 100,
          animation: 'slideUp 0.3s ease-out'
        }}>
          <button 
            className="btn-primary" 
            onClick={() => {
              const el = document.getElementById('cart-panel');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              setTimeout(() => setShowCheckoutModal(true), 400);
            }}
            style={{ 
              width: '100%', 
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
              justifyContent: 'space-between',
              padding: '0 24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShoppingCart size={20} />
              <span>{cart.length} items</span>
            </div>
            <span>KES {cartTotal.toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Checkout Payment Modal */}
      {showCheckoutModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card modal-responsive" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Complete Payment</h2>
              <button onClick={() => setShowCheckoutModal(false)} style={{ background: 'transparent', padding: 0 }}><X size={24} /></button>
            </div>
            
            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '24px' }}>
              {taxRate > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                    <span>KES {(cartTotal / (1 + (taxRate / 100))).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tax (Inclusive {taxRate}%)</span>
                    <span>KES {(cartTotal - (cartTotal / (1 + (taxRate / 100)))).toLocaleString()}</span>
                  </div>
                  <div style={{ borderTop: '2px dashed var(--border)', margin: '12px 0' }}></div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.5rem', fontWeight: 800 }}>
                <span>Total</span>
                <span style={{ color: 'var(--primary)' }}>KES {cartTotal.toLocaleString()}</span>
              </div>
            </div>

            {paymentMethod === 'Cash' && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                  {[100, 200, 500, 1000].map(amt => (
                    <button 
                      key={amt} 
                      className="btn-secondary" 
                      style={{ padding: '12px', minHeight: '48px', fontSize: '0.9rem', border: cashAmount === amt.toString() ? '2px solid var(--primary)' : '' }}
                      onClick={() => setCashAmount(amt.toString())}
                    >
                      + {amt}
                    </button>
                  ))}
                </div>
                
                <div className="input-with-icon-wrapper">
                  <label>Cash Received</label>
                  <input 
                    type="number" 
                    value={cashAmount} 
                    onChange={e => setCashAmount(e.target.value)}
                    placeholder="0.00"
                    style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'right', paddingRight: '20px' }}
                  />
                </div>

                {parseFloat(cashAmount) >= cartTotal && (
                  <div className="fade-in" style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Change Due</p>
                    <p style={{ fontSize: '2rem', fontWeight: 900, color: '#15803d' }}>KES {(parseFloat(cashAmount) - cartTotal).toLocaleString()}</p>
                    {parseFloat(cashAmount) === cartTotal && (
                      <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 800 }}>EXACT AMOUNT GIVEN ✔</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className={paymentMethod === 'Cash' ? "btn-primary" : "btn-secondary"} 
                  style={{ flex: 1, padding: '16px' }} 
                  onClick={() => setPaymentMethod('Cash')}
                >
                  <Banknote size={24} /> Cash
                </button>
                <button 
                  className={paymentMethod === 'M-Pesa' ? "btn-primary" : "btn-secondary"} 
                  style={{ flex: 1, padding: '16px', background: paymentMethod === 'M-Pesa' ? 'var(--success)' : '', color: paymentMethod === 'M-Pesa' ? 'white' : '' }} 
                  onClick={() => setPaymentMethod('M-Pesa')}
                >
                  <Smartphone size={24} /> M-Pesa
                </button>
              </div>

              {paymentMethod === 'M-Pesa' && (
                <div className="fade-in" style={{ background: '#f0fdf4', padding: '24px', borderRadius: '16px', border: '1px solid #dcfce7' }}>
                   {mpesaConfig?.is_enabled ? (
                     <div>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                         <span style={{ fontWeight: 600 }}>Total with Fee</span>
                         <span style={{ fontWeight: 900, fontSize: '1.25rem' }}>KES {(cartTotal + (mpesaConfig.convenience_fee || 0)).toLocaleString()}</span>
                       </div>
                       
                       <div className="input-with-icon-wrapper" style={{ marginBottom: '16px' }}>
                          <label style={{ color: '#166534', fontWeight: 700 }}>Customer Mobile Number</label>
                          <input 
                            type="text" 
                            placeholder="2547XXXXXXXX" 
                            value={mpesaPhone}
                            onChange={e => setMpesaPhone(e.target.value)}
                            style={{ borderColor: '#86efac', fontWeight: 800 }}
                            disabled={isAutomatingMpesa}
                          />
                       </div>

                       {automatedError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '12px' }}>{automatedError}</p>}

                       {pollingStatus === 'waiting' ? (
                         <div style={{ textAlign: 'center', padding: '10px' }}>
                           <p className="animate-pulse" style={{ fontWeight: 800, color: 'var(--success)' }}>Waiting for Customer PIN...</p>
                         </div>
                       ) : (
                        <button 
                          className="btn-primary" 
                          style={{ width: '100%', background: 'var(--success)' }}
                          onClick={initiateStkPush}
                          disabled={isAutomatingMpesa || !mpesaPhone}
                        >
                          Request STK Push
                        </button>
                       )}
                     </div>
                   ) : (
                      <div style={{ textAlign: 'center', padding: '10px 0' }}>
                        <Smartphone size={40} color="var(--text-muted)" style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                        <p style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Automation Disabled</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                          Enable "M-Pesa Automation" in Settings to use automated STK Push.
                        </p>
                        <div style={{ borderTop: '1px dashed var(--border)', margin: '16px 0' }}></div>
                        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Manual Instructions</p>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: '#15803d' }}>Pay KES {cartTotal.toFixed(2)} to 0768640343</p>
                        <div className="input-group" style={{ marginTop: '16px', marginBottom: 0 }}>
                          <label style={{ color: '#166534', fontWeight: 700 }}>M-Pesa Transaction Code</label>
                          <input 
                            required
                            type="text" 
                            placeholder="e.g. QRC7W8X9Y" 
                            value={mpesaCode}
                            onChange={e => setMpesaCode(e.target.value.toUpperCase())}
                            style={{ borderColor: '#86efac', fontWeight: 800, letterSpacing: '1px' }}
                          />
                        </div>
                      </div>
                   )}
                </div>
              )}

              <button 
                className="btn-primary" 
                style={{ 
                  width: '100%', 
                  height: '64px', 
                  fontSize: '1.25rem', 
                  marginTop: '12px', 
                  background: paymentMethod === 'M-Pesa' ? 'var(--success)' : 'var(--primary)',
                  opacity: (paymentMethod === 'M-Pesa' && !mpesaCode.trim() && !isAutomatingMpesa) ? 0.6 : 1,
                  cursor: (paymentMethod === 'M-Pesa' && !mpesaCode.trim() && !isAutomatingMpesa) ? 'not-allowed' : 'pointer'
                }}
                disabled={(paymentMethod === 'M-Pesa' && !mpesaCode.trim() && !isAutomatingMpesa) || isAutomatingMpesa}
                onClick={() => executePayment(paymentMethod)}
              >
                {isAutomatingMpesa ? 'Automating...' : `Confirm KES ${cartTotal.toFixed(2)} Paid`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner 
          onScan={handleScanProduct}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
    <footer style={{ marginTop: '20px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></div>
          Active Terminal: <strong>#{(localStorage.getItem('deviceId') || '01').substring(0,4).toUpperCase()}</strong>
        </div>
        <div>
          Logged in as: <strong>{staff ? `${staff.firstName} ${staff.lastName}` : 'Owner'}</strong> {staff?.code && `(Staff ${staff.code})`}
        </div>
    </footer>
    </div>
  );
}
