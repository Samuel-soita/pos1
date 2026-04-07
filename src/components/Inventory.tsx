import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSubscription } from '../hooks/useSubscription';
import { type Product } from '../db/db';
import { Plus, Edit2, Trash2, PackagePlus, Search, X } from 'lucide-react';

export function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct, restockProduct } = useInventory();
  const { status } = useSubscription();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    costPrice: 0,
    quantity: 0,
    lowStockThreshold: 5
  });

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'locked') return;
    
    if (editingId) {
      await updateProduct(editingId, formData);
      setEditingId(null);
    } else {
      await addProduct(formData);
      setIsAdding(false);
    }
    setFormData({ name: '', price: 0, costPrice: 0, quantity: 0, lowStockThreshold: 5 });
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id!);
    setFormData({
      name: product.name,
      price: product.price,
      costPrice: product.costPrice ?? 0,
      quantity: product.quantity,
      lowStockThreshold: product.lowStockThreshold
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Inventory Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track and manage your products and stock levels.</p>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => setIsAdding(true)}
          disabled={status === 'locked'}
        >
          <Plus size={20} />
          Add New Product
        </button>
      </header>

      {/* Search & Stats */}
      <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} size={20} />
          <input 
            type="text" 
            placeholder="Search inventory..." 
            style={{ paddingLeft: '44px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Product List */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', background: '#f8fafc' }}>
              <th style={{ padding: '16px' }}>Product Name</th>
              <th style={{ padding: '16px' }}>Price</th>
              <th style={{ padding: '16px' }}>Cost</th>
              <th style={{ padding: '16px' }}>Stock Level</th>
              <th style={{ padding: '16px' }}>Threshold</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => (
              <tr key={product.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px', fontWeight: 600 }}>{product.name}</td>
                <td style={{ padding: '16px' }}>${product.price.toFixed(2)}</td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }}>${(product.costPrice ?? 0).toFixed(2)}</td>
                <td style={{ padding: '16px' }}>
                  <span className={`stock-badge ${product.quantity <= product.lowStockThreshold ? 'stock-low' : 'stock-ok'}`}>
                    {product.quantity} units
                  </span>
                </td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{product.lowStockThreshold}</td>
                <td style={{ padding: '16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => restockProduct(product.id!, 10)} className="btn-secondary" style={{ padding: '8px' }} title="Quicks Add 10">
                    <PackagePlus size={18} />
                  </button>
                  <button onClick={() => startEdit(product)} className="btn-secondary" style={{ padding: '8px' }}>
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => deleteProduct(product.id!)} className="btn-secondary" style={{ padding: '8px', color: 'var(--danger)' }}>
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal Overlay */}
      {(isAdding || editingId) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card modal-responsive" style={{ padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{editingId ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => { setIsAdding(false); setEditingId(null); }} style={{ background: 'transparent', padding: 0 }}><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group">
                <label>Product Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label>Price ($)</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="input-group">
                  <label>Cost Price ($)</label>
                  <input required type="number" step="0.01" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label>Initial Stock</label>
                  <input required type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
                </div>
                <div className="input-group">
                  <label>Low Stock Threshold</label>
                  <input required type="number" value={formData.lowStockThreshold} onChange={e => setFormData({...formData, lowStockThreshold: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ width: '100%', marginTop: '12px' }}
                disabled={status === 'locked'}
              >
                {status === 'locked' ? 'Subscription Locked' : (editingId ? 'Update Product' : 'Create Product')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
