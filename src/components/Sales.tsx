import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { Search, ShoppingCart, Trash2, Plus, Minus, CheckCircle, X, Banknote, Smartphone, History as HistoryIcon, ArrowLeft } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type Sale } from '../db/db';
import { usePrinter } from '../hooks/usePrinter';
import { BarcodeScanner } from './BarcodeScanner';
import { History } from './History';

export function Sales() {
  const { products } = useInventory();
  const { cart, addToCart, removeFromCart, updateCartQuantity, completeSale, cartTotal } = useSales();
  const { status } = useSubscription();
  const { business, businessId } = useAuth();
  
  const [view, setView] = useState<'pos' | 'history'>('pos');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [mpesaCode, setMpesaCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'M-Pesa'>('Cash');
  const { printReceipt } = usePrinter();


  const taxRateSetting = useLiveQuery(() => db.settings.get('tax_rate'));
  const taxRate = typeof taxRateSetting?.value === 'number' ? taxRateSetting.value : 0;

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category || 'General')))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.barcode && p.barcode.includes(searchTerm));
    const matchesCategory = selectedCategory === 'All' || (p.category || 'General') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleScanProduct = (product: Product, customPrice?: number) => {
    const productWithPrice = { ...product, price: customPrice ?? product.price };
    addToCart(productWithPrice);
  };

  const executePayment = async (method: string) => {
    if (status === 'locked') return;
    const taxAmount = cartTotal - (cartTotal / (1 + (taxRate / 100))); 
    const currentCart = [...cart];
    const result = await completeSale(taxRate, taxAmount, method, method === 'M-Pesa' ? mpesaCode : undefined);
    
    if (result?.success) {
      setShowCheckoutModal(false);
      setShowSuccess(true);
      setMpesaCode('');
      
      const saleToPrint = {
        id: result.receiptId,
        businessId: businessId,
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
        transactionCode: method === 'M-Pesa' ? mpesaCode : undefined
      };
      
      await printReceipt(saleToPrint as Sale, business?.name || 'SMUTA PAY');

      setTimeout(() => setShowSuccess(false), 3000);
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
              type="text" 
              placeholder="Search products..." 
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
              className="product-card" 
              onClick={() => product.quantity > 0 && addToCart(product)} 
              style={{ 
                cursor: product.quantity > 0 ? 'pointer' : 'not-allowed', 
                opacity: product.quantity > 0 ? 1 : 0.6,
                padding: '12px'
              }}
            >
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2px' }}>{product.name}</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1rem' }}>KES {product.price.toLocaleString()}</div>
              <div className={`stock-badge ${product.quantity <= product.lowStockThreshold ? 'stock-low' : 'stock-ok'}`} style={{ marginTop: '6px', fontSize: '0.65rem' }}>
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
            <span>KES {cartTotal.toLocaleString()}</span>
          </div>
          
          {showSuccess && (
            <div style={{ background: '#dcfce7', color: '#166534', padding: '10px', borderRadius: '10px', textAlign: 'center', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <CheckCircle size={16} />
              Sale Completed!
            </div>
          )}

          <button 
            className="btn-primary" 
            style={{ width: '100%', height: '52px', fontSize: '1.1rem' }}
            disabled={cart.length === 0 || status === 'locked'}
            onClick={() => setShowCheckoutModal(true)}
          >
            Complete Checkout
          </button>
        </div>
        </div>
      </div>

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
                <span>KES {cartTotal.toLocaleString()}</span>
              </div>
            </div>

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
                   <p style={{ fontWeight: 700, color: '#166534', marginBottom: '8px' }}>Payment Instructions:</p>
                   <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d' }}>Send KES {cartTotal.toFixed(2)} to 0768640343</p>
                   <p style={{ fontSize: '0.875rem', color: '#166534', marginBottom: '20px' }}>Name: SAMUEL SOITA</p>
                   
                   <div className="input-group" style={{ marginBottom: 0 }}>
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

              <button 
                className="btn-primary" 
                style={{ 
                  width: '100%', 
                  height: '64px', 
                  fontSize: '1.25rem', 
                  marginTop: '12px', 
                  background: paymentMethod === 'M-Pesa' ? 'var(--success)' : 'var(--primary)',
                  opacity: (paymentMethod === 'M-Pesa' && !mpesaCode.trim()) ? 0.6 : 1,
                  cursor: (paymentMethod === 'M-Pesa' && !mpesaCode.trim()) ? 'not-allowed' : 'pointer'
                }}
                disabled={(paymentMethod === 'M-Pesa' && !mpesaCode.trim())}
                onClick={() => executePayment(paymentMethod)}
              >
                Confirm KES {cartTotal.toFixed(2)} Paid
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
  );
}
