import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { useSubscription } from '../hooks/useSubscription';
import { Search, ShoppingCart, Trash2, Plus, Minus, CheckCircle } from 'lucide-react';

export function Sales() {
  const { products } = useInventory();
  const { cart, addToCart, removeFromCart, updateCartQuantity, completeSale, cartTotal } = useSales();
  const { status } = useSubscription();
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCheckout = async () => {
    if (status === 'locked') return;
    const result = await completeSale();
    if (result?.success) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  return (
    <div className="pos-grid">
      {/* Product Catalog */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} size={20} />
          <input 
            type="text" 
            placeholder="Search products..." 
            style={{ paddingLeft: '44px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', overflowY: 'auto' }}>
          {filteredProducts.map(product => (
            <div key={product.id} className="product-card" onClick={() => product.quantity > 0 && addToCart(product)} style={{ cursor: product.quantity > 0 ? 'pointer' : 'not-allowed', opacity: product.quantity > 0 ? 1 : 0.6 }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>{product.name}</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.125rem' }}>${product.price.toFixed(2)}</div>
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
              Cart is empty. Select products to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>${item.price.toFixed(2)} per unit</div>
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
            <span>${cartTotal.toFixed(2)}</span>
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
            onClick={handleCheckout}
          >
            {status === 'locked' ? 'Subscription Locked' : 'Complete Checkout'}
          </button>
        </div>
      </div>
    </div>
  );
}
