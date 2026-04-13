import { useState } from 'react';
import { db, type Supplier, type Purchase, type Product } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../hooks/useAuth';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { 
  Truck, Plus, Search, Phone, Mail, 
  X, MapPin
} from 'lucide-react';

export function Procurement() {
  const [activeView, setActiveView] = useState<'purchases' | 'suppliers'>('purchases');
  const { businessId, business } = useAuth();
  
  const suppliers = useLiveQuery(() => 
    businessId ? db.suppliers.where('businessId').equals(businessId).toArray() : []
  , [businessId]) || [];

  const purchases = useLiveQuery(() => 
    businessId ? db.purchases.where('businessId').equals(businessId).reverse().sortBy('timestamp') : []
  , [businessId]) || [];

  const products = useLiveQuery(() => 
    businessId ? db.products.where('businessId').equals(businessId).toArray() : []
  , [businessId]) || [];

  // Add Supplier State
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', contact: '', phone: '', email: '', pin: '' });

  // Add Purchase State
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [cart, setCart] = useState<Array<{ productId: string; name: string; quantity: number; costPrice: number }>>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !business) return;
    
    const deviceId = await getDeviceId();
    const id = await generateTraceableId('SUP', businessId, business.code, deviceId);
    
    const supplier: Supplier = {
      id,
      businessId,
      name: newSupplier.name,
      contactPerson: newSupplier.contact,
      phone: newSupplier.phone,
      email: newSupplier.email,
      kraPin: newSupplier.pin
    };

    await db.transaction('rw', [db.suppliers, db.pos_events], async () => {
      await db.suppliers.add(supplier);
      await db.pos_events.add({
        event_id: await generateTraceableId('ORD', businessId, business.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'SUPPLIER_CREATED',
        payload: supplier,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: 'LATER',
        sync_status: 'pending'
      });
    });

    setNewSupplier({ name: '', contact: '', phone: '', email: '', pin: '' });
    setShowAddSupplier(false);
  };

  const handleCreatePurchase = async () => {
    if (!businessId || !business || cart.length === 0) return;
    const deviceId = await getDeviceId();
    const purchaseId = await generateTraceableId('PUR', businessId, business.code, deviceId);
    
    const total = cart.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);
    
    const purchase: Purchase = {
      id: purchaseId,
      businessId,
      supplierId: selectedSupplier || undefined,
      total,
      timestamp: Date.now(),
      paymentStatus: 'paid',
      items: cart.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: i.costPrice }))
    };

    await db.transaction('rw', [db.purchases, db.pos_events], async () => {
      await db.purchases.add(purchase);
      await db.pos_events.add({
        event_id: await generateTraceableId('ORD', businessId, business.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'PURCHASE_CREATED',
        payload: purchase,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: 'LATER',
        sync_status: 'pending'
      });
    });

    setCart([]);
    setSelectedSupplier('');
    setShowAddPurchase(false);
    alert('Restocking complete! Inventory will update momentarily.');
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(i => i.productId === product.id);
    if (existing) {
      setCart(cart.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { productId: product.id, name: product.name, quantity: 1, costPrice: product.costPrice || 0 }]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '8px' }}>Suppliers and Purchases</h1>
          <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Manage suppliers and stock restocking</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', background: '#f1f5f9', padding: '6px', borderRadius: '14px' }}>
          <button 
            className={activeView === 'purchases' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setActiveView('purchases')}
            style={{ borderRadius: '10px' }}
          >
            Purchases
          </button>
          <button 
            className={activeView === 'suppliers' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setActiveView('suppliers')}
            style={{ borderRadius: '10px' }}
          >
            Suppliers
          </button>
        </div>
      </header>

      {activeView === 'purchases' ? (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Recent Sourcing</h2>
                <button className="btn-primary" onClick={() => setShowAddPurchase(true)}>
                  <Plus size={18} /> New Restock
                </button>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '12px' }}>Date</th>
                      <th style={{ padding: '12px' }}>Supplier</th>
                      <th style={{ padding: '12px' }}>Items</th>
                      <th style={{ padding: '12px' }}>Total Cost</th>
                      <th style={{ padding: '12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map(p => {
                      const supplier = suppliers.find(s => s.id === p.supplierId);
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontSize: '0.85rem' }}>{new Date(p.timestamp).toLocaleDateString()}</td>
                          <td style={{ padding: '12px', fontWeight: 700 }}>{supplier?.name || 'Generic / Cash'}</td>
                          <td style={{ padding: '12px', fontSize: '0.85rem' }}>{p.items.length} Products</td>
                          <td style={{ padding: '12px', fontWeight: 800 }}>KES {p.total.toLocaleString()}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800, background: '#dcfce7', color: '#166534' }}>
                              {p.paymentStatus?.toUpperCase() || 'PAID'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ background: 'var(--primary)', color: 'white' }}>
              <h3 style={{ marginBottom: '16px', fontWeight: 800 }}>Procurement Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Total Value (30d)</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900 }}>KES {purchases.reduce((a, b) => a + b.total, 0).toLocaleString()}</div>
                </div>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.2)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Suppliers</span>
                  <span style={{ fontWeight: 800 }}>{suppliers.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Restocks</span>
                  <span style={{ fontWeight: 800 }}>{purchases.length}</span>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
            <div 
              onClick={() => setShowAddSupplier(true)}
              style={{ border: '2px dashed var(--border)', borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px', cursor: 'pointer' }}
            >
              <div style={{ background: 'var(--primary)', padding: '12px', borderRadius: '50%', color: 'white' }}>
                <Plus size={24} />
              </div>
              <div style={{ fontWeight: 800 }}>Add New Supplier</div>
            </div>

            {suppliers.map(s => (
              <div key={s.id} className="card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '12px' }}>
                    <Truck color="var(--primary)" size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 900 }}>{s.name}</h3>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.kraPin || 'No KRA PIN'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={14} color="var(--text-muted)" /> {s.phone}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={14} color="var(--text-muted)" /> {s.email || 'No Email'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={14} color="var(--text-muted)" /> {s.contactPerson}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontWeight: 900 }}>Register Supplier</h2>
              <button onClick={() => setShowAddSupplier(false)} style={{ background: 'transparent' }}><X /></button>
            </div>
            <form onSubmit={handleAddSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label>Company Name</label>
                <input required value={newSupplier.name} onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label>Phone</label>
                  <input required value={newSupplier.phone} onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>KRA PIN</label>
                  <input value={newSupplier.pin} onChange={e => setNewSupplier({ ...newSupplier, pin: e.target.value })} />
                </div>
              </div>
              <div className="input-group">
                <label>Contact Person / Location</label>
                <input value={newSupplier.contact} onChange={e => setNewSupplier({ ...newSupplier, contact: e.target.value })} />
              </div>
              <button type="submit" className="btn-primary" style={{ height: '56px', marginTop: '12px' }}>Add Supplier</button>
            </form>
          </div>
        </div>
      )}

      {/* New Purchase Modal (The Brain) */}
      {showAddPurchase && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontWeight: 900 }}>Create Restocking Order</h2>
              <button onClick={() => setShowAddPurchase(false)} style={{ background: 'transparent' }}><X /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', flex: 1, minHeight: 0 }}>
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
                
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {products
                    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(p => (
                      <div 
                        key={p.id} 
                        onClick={() => addToCart(p)}
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

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                </div>

                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 900, marginBottom: '16px' }}>
                    <span>Total</span>
                    <span>KES {cart.reduce((a, b) => a + (b.quantity * b.costPrice), 0).toLocaleString()}</span>
                  </div>
                  <button className="btn-primary" style={{ width: '100%' }} onClick={handleCreatePurchase}>Confirm Restock</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
