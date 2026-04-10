import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { Search, ShoppingCart, Trash2, Plus, Minus, CheckCircle, X, Banknote, Smartphone } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type Sale } from '../db/db';
import { usePrinter } from '../hooks/usePrinter';
import { BarcodeScanner } from './BarcodeScanner';

export function Sales() {
  const { products } = useInventory();
  const { cart, addToCart, removeFromCart, updateCartQuantity, completeSale, cartTotal } = useSales();
  const { status } = useSubscription();
  const { business, businessId } = useAuth();
  
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

  return (
    <div className="pos-grid">
      {/* Product Catalog */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
          {categories.map(cat => (
            <button 
              key={cat} 
              onClick={() => setSelectedCategory(cat)}
              className={selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}
              style={{ whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: '20px' }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} size={20} />
            <input 
              type="text" 
              placeholder="Search products..." 
              style={{ paddingLeft: '44px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={() => setShowScanner(true)}
            style={{ width: 'auto', padding: '0 20px', background: 'var(--primary)' }}
          >
            <Smartphone size={20} /> Scan
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', overflowY: 'auto', paddingBottom: '24px' }}>
          {filteredProducts.map(product => (
            <div key={product.id} className="product-card" onClick={() => product.quantity > 0 && addToCart(product)} style={{ cursor: product.quantity > 0 ? 'pointer' : 'not-allowed', opacity: product.quantity > 0 ? 1 : 0.6 }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>{product.name}</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.125rem' }}>KES {product.price.toLocaleString()}</div>
              <div className={`stock-badge ${product.quantity <= product.lowStockThreshold ? 'stock-low' : 'stock-ok'}`} style={{ marginTop: '8px' }}>
                Stock: {product.quantity}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShoppingCart size={24} />
          Current Cart
        </h2>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '24px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Cart is empty. Select products or scan a barcode to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>KES {(item.price).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                      <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, item.quantity - 1); }} style={{ padding: '4px 8px', borderRadius: 0, background: 'transparent' }}><Minus size={14} /></button>
                      <span style={{ padding: '0 8px', fontWeight: 600 }}>{item.quantity}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, item.quantity + 1); }} style={{ padding: '4px 8px', borderRadius: 0, background: 'transparent' }}><Plus size={14} /></button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }} style={{ color: 'var(--danger)', padding: '8px', background: 'transparent' }}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: '2px dashed var(--border)', paddingTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 800, marginBottom: '24px' }}>
            <span>Total Amount</span>
            <span>KES {cartTotal.toLocaleString()}</span>
          </div>
          
          {showSuccess && (
            <div style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '12px', textAlign: 'center', marginBottom: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <CheckCircle size={20} />
              Sale Completed Successfully!
            </div>
          )}

          <button 
            className="btn-primary" 
            style={{ width: '100%', height: '60px', fontSize: '1.25rem' }}
            disabled={cart.length === 0 || status === 'locked'}
            onClick={() => setShowCheckoutModal(true)}
          >
            Complete Checkout
          </button>
        </div>
      </div>

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
                <span>${cartTotal.toFixed(2)}</span>
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
                     <label style={{ color: '#166534' }}>M-Pesa Transaction Code (Optional)</label>
                     <input 
                       type="text" 
                       placeholder="e.g. QRC7W8X9Y" 
                       value={mpesaCode}
                       onChange={e => setMpesaCode(e.target.value.toUpperCase())}
                       style={{ borderColor: '#86efac' }}
                     />
                   </div>
                </div>
              )}

              <button 
                className="btn-primary" 
                style={{ width: '100%', height: '64px', fontSize: '1.25rem', marginTop: '12px', background: paymentMethod === 'M-Pesa' ? 'var(--success)' : 'var(--primary)' }}
                onClick={() => executePayment(paymentMethod)}
              >
                Confirm {cartTotal.toFixed(2)} Paid
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
