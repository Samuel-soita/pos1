import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';

import { Search, ShoppingCart, CheckCircle, X, Banknote, Smartphone, History as HistoryIcon, ArrowLeft, Printer, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type Sale } from '../db/db';
import { usePrinter } from '../hooks/usePrinter';
import { useSyncStatus } from '../hooks/useSync';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { playChime, playBeep } from '../utils/audio';

// Lazy load heavy or secondary sub-components for instant Sales view boot
const BarcodeScanner = lazy(() => import('./BarcodeScanner').then(m => ({ default: m.BarcodeScanner })));
const History = lazy(() => import('./History').then(m => ({ default: m.History })));

import { ProductCard } from './sales/ProductCard';
import { CartItem } from './sales/CartItem';

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
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isOnline, pendingCount } = useSyncStatus();
  
  // Sensory States
  
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

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'M-Pesa'>('Cash');
  const { printReceipt } = usePrinter();
  const { status: subStatus, limitReached, message: subMessage } = useSubscription();

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

    // Pre-flight Stock Guard: Double check server stock if online to prevent multi-terminal conflicts
    if (navigator.onLine) {
      try {
        const { supabase } = await import('../lib/supabase');
        for (const item of cart) {
          const { data: serverProduct } = await supabase
            .from('products')
            .select('quantity')
            .eq('id', item.productId)
            .maybeSingle();
          
          if (serverProduct && serverProduct.quantity < item.quantity) {
             alert(`⚠️ Multi-terminal conflict: ${item.name} just went out of stock on another device.`);
             return;
          }
        }
      } catch (e) {
        console.warn("Stock guard check failed, proceeding with local truth:", e);
      }
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
      
      const saleToPrint = {
        id: result.receiptId,
        businessId: businessId || '',
        receiptId: result.receiptId,
        total: cartTotal,
        totalProfit: 0,
        timestamp: Date.now(),
        items: currentCart.map(item => ({
          productId: item.productId,
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
  }, [limitReached, cartTotal, taxRate, cart, mpesaCode, completeSale, subStatus, businessId, setShowCheckoutModal, setShowSuccess, setMpesaCode, business, printReceipt]);

  useHardwareScanner(handleHardwareScan);


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
        <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Loading History...</div>}>
          <History />
        </Suspense>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
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
              style={{ 
                padding: '8px 16px', 
                minHeight: '40px', 
                fontSize: '0.9rem', 
                gap: '8px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                fontWeight: 700,
                cursor: 'pointer'
              }}
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
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  isGlowing={glowingProductId === product.id} 
                  onSelect={handleScanProduct} 
                />
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
                    <CartItem 
                      key={item.productId} 
                      item={item} 
                      onUpdateQuantity={updateCartQuantity} 
                      onRemove={removeFromCart} 
                    />
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '16px' }}>
                    {[50, 100, 200, 500, 1000].map(amt => (
                      <button 
                        key={amt} 
                        className="btn-secondary" 
                        style={{ padding: '12px', minHeight: '48px', fontSize: '0.8rem', fontWeight: 800, border: cashAmount === amt.toString() ? '2px solid var(--primary)' : '' }}
                        onClick={() => setCashAmount(amt.toString())}
                      >
                        +{amt}
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
                      <div style={{ textAlign: 'center', padding: '10px 0' }}>
                        <Smartphone size={40} color="var(--primary)" style={{ opacity: 0.5, margin: '0 auto 12px' }} />
                        <p style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>M-Pesa Express (Coming Soon)</p>
                        
                        <div style={{ borderTop: '1px dashed var(--border)', margin: '16px 0' }}></div>
                        
                        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Manual Payment</p>
                        <p style={{ fontSize: '1.1rem', fontWeight: 900, color: '#15803d', marginBottom: '16px' }}>Pay KES {cartTotal.toFixed(2)} to 0768640343</p>
                        
                        <div className="input-group" style={{ textAlign: 'left', marginBottom: 0 }}>
                          <label style={{ color: '#166534', fontWeight: 700 }}>M-Pesa Code</label>
                          <p style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '8px' }}>Leave blank if you visually confirmed the payment on your phone.</p>
                          <input 
                            type="text" 
                            placeholder="e.g. QRC7W8X9Y" 
                            value={mpesaCode}
                            onChange={e => setMpesaCode(e.target.value.toUpperCase())}
                            style={{ borderColor: '#86efac', fontWeight: 800, letterSpacing: '1px' }}
                          />
                        </div>
                      </div>
                  </div>
                )}

                <button 
                  className="btn-primary" 
                  style={{ 
                    width: '100%', 
                    height: '64px', 
                    fontSize: '1.25rem', 
                    marginTop: '12px'
                  }}
                  onClick={() => executePayment(paymentMethod)}
                >
                  {`Confirm KES ${cartTotal.toFixed(2)} Paid`}
                </button>
              </div>
            </div>
          </div>
        )}

        {showScanner && (
          <Suspense fallback={null}>
            <BarcodeScanner 
              onScan={handleScanProduct}
              onClose={() => setShowScanner(false)}
            />
          </Suspense>
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
