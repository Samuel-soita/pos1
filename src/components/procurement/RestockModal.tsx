import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { type Product, type Supplier } from '../../db/db';

interface RestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  suppliers: Supplier[];
  onSubmit: (selectedSupplier: string, cart: Array<{ productId: string; name: string; quantity: number; costPrice: number }>) => Promise<void>;
}

export function RestockModal({ isOpen, onClose, products, suppliers, onSubmit }: RestockModalProps) {
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [cart, setCart] = useState<Array<{ productId: string; name: string; quantity: number; costPrice: number }>>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddToCart = (product: Product) => {
    const existing = cart.find(i => i.productId === product.id);
    if (existing) {
      setCart(cart.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { productId: product.id, name: product.name, quantity: 1, costPrice: product.costPrice || 0 }]);
    }
  };

  const handleConfirmRestock = () => {
    onSubmit(selectedSupplier, cart).then(() => {
      setCart([]);
      setSelectedSupplier('');
    });
  };

  const totalCost = cart.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Restocking Order" maxWidth="800px">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(300px, 1fr)', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Product Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
          <div className="input-icon-wrapper">
            <Search className="input-icon" size={18} />
            <input 
              placeholder="Search inventory to restock..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px' }}>
            {products
              .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(p => (
                <div 
                  key={p.id} 
                  onClick={() => handleAddToCart(p)}
                  style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current: {p.quantity} units</div>
                  </div>
                  <Plus size={18} color="var(--primary)" />
                </div>
              ))
            }
          </div>
        </div>

        {/* Order Cart */}
        <div style={{ background: '#f8fafc', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="input-group">
            <label>Supplier</label>
            <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
              <option value="">No Supplier (Direct Cash)</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>ORDER ITEMS</h4>
            {cart.map((item, idx) => (
              <div key={item.productId} style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.name}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    type="number" 
                    value={item.quantity} 
                    onChange={e => setCart(cart.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 0 } : it))}
                    style={{ width: '60px', height: '32px', fontSize: '0.8rem' }} 
                  />
                  <span style={{ fontSize: '0.8rem' }}>x</span>
                  <input 
                    type="number" 
                    value={item.costPrice} 
                    onChange={e => setCart(cart.map((it, i) => i === idx ? { ...it, costPrice: parseFloat(e.target.value) || 0 } : it))}
                    style={{ flex: 1, height: '32px', fontSize: '0.8rem' }} 
                  />
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>Cart is empty.</p>
            )}
          </div>

          <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 900, marginBottom: '16px' }}>
              <span>Total</span>
              <span>KES {totalCost.toLocaleString()}</span>
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={handleConfirmRestock} disabled={cart.length === 0}>
              Confirm Restock
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
