import { useState } from 'react';
import { db, type Supplier, type Purchase } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../hooks/useAuth';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { Plus } from 'lucide-react';
import { useLayout } from '../context/LayoutContext';

// Granular Sub-components (Phase 2 SOLID)
import { SupplierList } from './procurement/SupplierList';
import { AddSupplierModal } from './procurement/AddSupplierModal';
import { RestockModal } from './procurement/RestockModal';
import { PurchaseHistory } from './procurement/PurchaseHistory';

export function Procurement({ initialView = 'purchases' }: { initialView?: 'purchases' | 'suppliers' }) {
  const [activeView, setActiveView] = useState<'purchases' | 'suppliers'>(initialView);
  const { businessId, business, branchId, userType } = useAuth();
  const { requestAuth } = useLayout();
  
  const suppliers = useLiveQuery(() => 
    businessId ? db.suppliers.where('businessId').equals(businessId).toArray() : []
  , [businessId]) || [];

  const purchases = useLiveQuery(() => {
    if (!businessId) return [];
    let collection = db.purchases.where('businessId').equals(businessId);
    if (userType === 'staff' && branchId) {
      collection = collection.and(p => p.branchId === branchId);
    }
    return collection.reverse().sortBy('timestamp');
  }, [businessId, branchId, userType]) || [];

  const products = useLiveQuery(() => {
    if (!businessId) return [];
    let collection = db.products.where('businessId').equals(businessId);
    if (userType === 'staff' && branchId) {
      collection = collection.and(p => p.branchId === branchId);
    }
    return collection.toArray();
  }, [businessId, branchId, userType]) || [];

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);

  const onAddSupplier = async (formData: { name: string; contact: string; phone: string; email: string; pin: string }) => {
    if (!businessId || !business) return;
    const deviceId = await getDeviceId();
    const id = await generateTraceableId('SUP', businessId, business?.code, deviceId);
    
    const supplier: Supplier = {
      id,
      businessId,
      name: formData.name,
      contactPerson: formData.contact,
      phone: formData.phone,
      email: formData.email,
      kraPin: formData.pin
    };

    await db.transaction('rw', [db.suppliers, db.pos_events, db.counters, db.settings], async () => {
      await db.suppliers.add(supplier);
      const eventHash = await generateEventHash(supplier);
      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'SUPPLIER_CREATED',
        payload: supplier,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });

    setShowAddSupplier(false);
  };

  const onUpdateSupplier = async (id: string, updates: Partial<Supplier>) => {
    if (!businessId || !business) return;
    const deviceId = await getDeviceId();
    const payload = { id, businessId, ...updates };

    await db.transaction('rw', [db.suppliers, db.pos_events, db.counters, db.settings], async () => {
        await db.suppliers.update(id, updates);
        const eventHash = await generateEventHash(payload);
        await db.pos_events.add({
            event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
            business_id: businessId,
            staff_id: 'owner',
            event_type: 'SUPPLIER_UPDATED',
            payload,
            client_timestamp: Date.now(),
            server_timestamp: 0,
            hash: eventHash,
            sync_status: 'pending'
        });
    });
  };

  const onDeleteSupplier = async (id: string) => {
    if (!businessId || !business) return;
    requestAuth(async () => {
      if (confirm('Are you sure you want to delete this supplier?')) {
        const deviceId = await getDeviceId();
        const now = Date.now();
        await db.transaction('rw', [db.suppliers, db.pos_events, db.counters, db.settings], async () => {
            await db.suppliers.delete(id);
            const payload = { id };
            const eventHash = await generateEventHash(payload);
            await db.pos_events.add({
                event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
                business_id: businessId,
                staff_id: 'owner',
                event_type: 'SUPPLIER_DELETED',
                payload,
                client_timestamp: now,
                server_timestamp: 0,
                hash: eventHash,
                sync_status: 'pending'
            });
        });
      }
    });
  };

  const onCreatePurchase = async (selectedSupplier: string, cart: Array<{ productId: string; name: string; quantity: number; costPrice: number }>) => {
    if (!businessId || !business || cart.length === 0) return;
    const deviceId = await getDeviceId();
    const purchaseId = await generateTraceableId('PUR', businessId, business?.code, deviceId);
    
    const total = cart.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);
    
    const purchase: Purchase = {
      id: purchaseId,
      businessId,
      branchId: branchId || undefined,
      supplierId: selectedSupplier || undefined,
      total,
      timestamp: Date.now(),
      paymentStatus: 'paid',
      items: cart.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: i.costPrice }))
    };

    await db.transaction('rw', [db.purchases, db.pos_events, db.counters, db.settings, db.products, db.inventory_ledger], async () => {
      await db.purchases.add(purchase);
      const eventHash = await generateEventHash(purchase);
      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'PURCHASE_CREATED',
        payload: purchase,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });

      for (const item of purchase.items) {
        const product = await db.products.get(item.productId);
        if (product) {
          await db.products.update(item.productId, {
            quantity: product.quantity + item.quantity,
            updatedAt: Date.now()
          });

          await db.inventory_ledger.add({
            id: await generateTraceableId('INV', businessId, business?.code, deviceId),
            businessId: businessId,
            productId: item.productId,
            action: 'ADD',
            quantity: item.quantity,
            recordedAt: Date.now(),
            syncStatus: 'synced'
          });
        }
      }
    });

    setShowAddPurchase(false);
    alert('Restocking complete! Inventory will update momentarily.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '8px' }}>
            {activeView === 'purchases' ? 'Purchases & Restocking' : 'Supplier Registry'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            {activeView === 'purchases' ? 'Manage your stock restocking orders' : 'Manage your supplier contacts'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px' }}>
          <button 
            onClick={() => setActiveView('purchases')}
            style={{ 
              padding: '8px 20px', 
              borderRadius: '8px', 
              fontSize: '0.85rem', 
              fontWeight: 800,
              background: activeView === 'purchases' ? 'white' : 'transparent',
              color: activeView === 'purchases' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeView === 'purchases' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            Purchases
          </button>
          <button 
            onClick={() => setActiveView('suppliers')}
            style={{ 
              padding: '8px 20px', 
              borderRadius: '8px', 
              fontSize: '0.85rem', 
              fontWeight: 800,
              background: activeView === 'suppliers' ? 'white' : 'transparent',
              color: activeView === 'suppliers' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeView === 'suppliers' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            Suppliers
          </button>
        </div>
      </header>

      {activeView === 'purchases' ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Recent Sourcing</h2>
              <button className="btn-primary" onClick={() => setShowAddPurchase(true)}>
                <Plus size={18} /> New Restock
              </button>
            </div>
            <PurchaseHistory purchases={purchases} suppliers={suppliers} />
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
      ) : (
        <SupplierList 
          suppliers={suppliers} 
          onAddClick={() => setShowAddSupplier(true)} 
          onUpdate={onUpdateSupplier} 
          onDelete={onDeleteSupplier} 
        />
      )}

      <AddSupplierModal isOpen={showAddSupplier} onClose={() => setShowAddSupplier(false)} onSubmit={onAddSupplier} />
      <RestockModal 
        isOpen={showAddPurchase} 
        onClose={() => setShowAddPurchase(false)} 
        products={products} 
        suppliers={suppliers} 
        onSubmit={onCreatePurchase} 
      />
    </div>
  );
}
