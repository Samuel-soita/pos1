import { Plus, Search, X, Download, Upload, FileText, Check, AlertCircle, Bell } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useState, useCallback } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { type Product, type Branch } from '../db/db';
import { parseCSV } from '../utils/csvUtils';
import { playBeep, playChime } from '../utils/audio';
import { InventoryRow } from './inventory/InventoryRow';

export function Inventory() {
  const { products, addProduct, bulkAddProducts, updateProduct, deleteProduct, restockProduct, auditProduct } = useInventory();
  const { status } = useSubscription();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<Omit<Product, 'id' | 'businessId' | 'syncStatus'>[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { notifications } = useNotifications();
  const [auditingProduct, setAuditingProduct] = useState<Product | null>(null);
  const [physicalCount, setPhysicalCount] = useState<number>(0);
  const [isAuditing, setIsAuditing] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    costPrice: 0,
    quantity: 0,
    lowStockThreshold: 5,
    category: '', 
    barcode: '',
    branchId: ''
  });

  const uniqueCategories = Array.from(new Set(products.map(p => p.category || 'General'))).sort();

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.barcode || '').includes(searchTerm)
  );

  const { branches } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'suspended') return;
    
    const productData = {
      ...formData,
      branchId: formData.branchId || undefined
    };

    if (editingId) {
      await updateProduct(editingId, productData);
      playBeep();
      setEditingId(null);
    } else {
      await addProduct(productData);
      playChime();
      setIsAdding(false);
    }
    setFormData({ name: '', price: 0, costPrice: 0, quantity: 0, lowStockThreshold: 5, category: '', barcode: '', branchId: '' });
  };

  const startEdit = useCallback((product: Product) => {
    setEditingId(product.id!);
    setFormData({
      name: product.name,
      price: product.price,
      costPrice: product.costPrice ?? 0,
      quantity: product.quantity,
      lowStockThreshold: product.lowStockThreshold ?? 5,
      category: product.category || 'General',
      barcode: product.barcode || '',
      branchId: product.branchId || ''
    });
  }, []);

  const handleAuditClick = useCallback((product: Product) => {
    setAuditingProduct(product); 
    setPhysicalCount(product.quantity);
  }, []);

  const handleExport = () => {
    const headers = ['Name', 'Category', 'Price', 'Cost Price', 'Quantity', 'Barcode'];
    const rows = products.map(p => [
      p.name,
      p.category || 'General',
      p.price,
      p.costPrice || 0,
      p.quantity,
      p.barcode || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleDownloadTemplate = () => {
    const headers = ['Name', 'Category', 'Price', 'Cost Price', 'Quantity', 'Barcode'];
    const csvContent = headers.join(',') + '\nProduct Name,General,100,70,50,123456';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "inventory_template.csv";
    link.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const results = parseCSV(text);
        
        if (results.length === 0) throw new Error('File is empty or invalid');

        const headers = Object.keys(results[0]);
        const required = ['name', 'price', 'quantity'];
        const missing = required.filter(r => !headers.includes(r));
        if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(', ')}`);
        
        const parsed = results.map(row => ({
          name: row['name'] || 'Unnamed Product',
          category: row['category'] || 'General',
          price: parseFloat(row['price']) || 0,
          costPrice: parseFloat(row['cost price'] || row['costprice']) || 0,
          quantity: parseInt(row['quantity']) || 0,
          barcode: row['barcode'] || '',
          lowStockThreshold: 5,
          updatedAt: Date.now()
        }));
        setImportPreview(parsed);
      } catch (err: unknown) {
        alert('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setIsImporting(true);
    try {
      await bulkAddProducts(importPreview);
      setImportPreview(null);
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed. Please check your file format.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* 0. System Alerts (Migrated from Dashboard) */}
      {notifications.length > 0 && (
        <section>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {notifications.map(n => (
              <div key={n.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderLeft: `6px solid ${n.severity === 'error' ? 'var(--danger)' : 'var(--primary)'}` }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <Bell size={20} color="var(--primary)" />
                  <p style={{ fontWeight: 700, margin: 0 }}>{n.message}</p>
                </div>
                <div style={{ padding: '4px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>Action Required</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Inventory</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <input 
              type="file" 
              accept=".csv" 
              style={{ display: 'none' }} 
              id="csv-import" 
              onChange={handleImport} 
            />
            <label 
              htmlFor="csv-import" 
              className="btn-secondary" 
              style={{ padding: '0 12px', height: '44px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              title="Import CSV"
            >
              <Upload size={20} />
            </label>
          </div>
          <button 
            className="btn-secondary" 
            onClick={handleDownloadTemplate}
            style={{ padding: '0 12px', height: '44px' }}
            title="Download Template"
          >
            <FileText size={20} />
          </button>
          <button 
            className="btn-secondary" 
            onClick={handleExport}
            style={{ padding: '0 12px', height: '44px' }}
            title="Export CSV"
          >
            <Download size={20} />
          </button>
          <button 
            className="btn-primary" 
            onClick={() => setIsAdding(true)}
            disabled={status === 'suspended'}
            style={{ height: '44px' }}
          >
            <Plus size={20} />
            Add New Product
          </button>
        </div>
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
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', background: '#f8fafc' }}>
              <th style={{ padding: '16px' }}>Product Name</th>
              <th style={{ padding: '16px' }}>Category</th>
              <th style={{ padding: '16px' }}>Price</th>
              <th style={{ padding: '16px' }}>Cost</th>
              <th style={{ padding: '16px' }}>Stock Level</th>
              <th style={{ padding: '16px' }}>Threshold</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product: Product) => (
              <InventoryRow 
                key={product.id}
                product={product}
                status={status}
                onAudit={handleAuditClick}
                onRestock={restockProduct}
                onEdit={startEdit}
                onDelete={deleteProduct}
              />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label>Product Name</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="input-group">
                  <label>Barcode</label>
                  <input type="text" value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} placeholder="Scan or type" />
                </div>
              </div>
              <div className="input-group">
                <label>Category</label>
                <input 
                  required 
                  type="text" 
                  value={formData.category} 
                  onChange={e => setFormData({...formData, category: e.target.value})} 
                  placeholder="e.g. Bedding, Restaurant, Bar" 
                  list="inventory-categories"
                />
                <datalist id="inventory-categories">
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              {branches.length > 0 && (
                <div className="input-group">
                  <label>Assign to Branch (Optional)</label>
                  <select 
                    value={formData.branchId} 
                    onChange={e => setFormData({...formData, branchId: e.target.value})}
                    style={{ height: '44px', fontWeight: 700 }}
                  >
                    <option value="">Global / All Branches</option>
                    {branches.map((b: Branch) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label>Price (KES)</label>
                  <input required type="number" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="input-group">
                  <label>Cost Price (KES)</label>
                  <input required type="number" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: parseFloat(e.target.value) || 0})} />
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
                disabled={status === 'suspended'}
              >
                {editingId ? 'Update Product' : 'Create Product'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Audit Modal */}
      {auditingProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Audit: {auditingProduct.name}</h2>
              <button onClick={() => setAuditingProduct(null)} style={{ background: 'transparent' }}><X size={24} /></button>
            </div>
            
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ledger Quantity:</span>
                <span style={{ fontWeight: 800 }}>{auditingProduct.quantity} units</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Variance:</span>
                <span style={{ fontWeight: 800, color: (physicalCount - auditingProduct.quantity) === 0 ? 'inherit' : (physicalCount - auditingProduct.quantity) > 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {physicalCount - auditingProduct.quantity > 0 ? '+' : ''}{physicalCount - auditingProduct.quantity}
                </span>
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label>Actual Physical Count on Shelf</label>
              <input 
                autoFocus
                type="number" 
                value={physicalCount} 
                onChange={e => setPhysicalCount(parseInt(e.target.value) || 0)} 
                style={{ fontSize: '1.5rem', textAlign: 'center', fontWeight: 800 }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn-primary" 
                style={{ flex: 2 }}
                onClick={async () => {
                  setIsAuditing(true);
                  await auditProduct(auditingProduct.id!, physicalCount);
                  setIsAuditing(false);
                  setAuditingProduct(null);
                }}
                disabled={isAuditing}
              >
                {isAuditing ? 'Auditing...' : 'Confirm Audit Result'}
              </button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAuditingProduct(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="card" style={{ width: '90%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bulk Import Preview</h2>
              <button onClick={() => setImportPreview(null)} style={{ background: 'transparent' }}><X size={24} /></button>
            </div>
            
            <div style={{ overflowX: 'auto', flex: 1, marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px' }}>Name</th>
                    <th style={{ padding: '12px' }}>Category</th>
                    <th style={{ padding: '12px' }}>Price</th>
                    <th style={{ padding: '12px' }}>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px' }}>{item.name}</td>
                      <td style={{ padding: '12px' }}>{item.category}</td>
                      <td style={{ padding: '12px' }}>KES {item.price}</td>
                      <td style={{ padding: '12px' }}>{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <AlertCircle size={16} />
                <span>Found {importPreview.length} items to import.</span>
              </div>
              <button className="btn-secondary" onClick={() => setImportPreview(null)}>Cancel</button>
              <button 
                className="btn-primary" 
                onClick={confirmImport}
                disabled={isImporting}
                style={{ minWidth: '140px' }}
              >
                {isImporting ? 'Processing...' : (
                  <>
                    <Check size={18} /> Confirm Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
