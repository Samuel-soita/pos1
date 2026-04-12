import { Plus, Edit2, Trash2, PackagePlus, Search, X, Download, Upload, FileText, Check, AlertCircle, Bell } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useSubscription } from '../hooks/useSubscription';
import { type Product } from '../db/db';

export function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct, restockProduct } = useInventory();
  const { status } = useSubscription();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { notifications } = useNotifications();
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    costPrice: 0,
    quantity: 0,
    lowStockThreshold: 5,
    category: '', // Leave empty for focus, logic will handle 'General' fallback
    barcode: ''
  });

  const uniqueCategories = Array.from(new Set(products.map(p => p.category || 'General'))).sort();

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'suspended') return;
    
    if (editingId) {
      await updateProduct(editingId, formData);
      setEditingId(null);
    } else {
      await addProduct(formData);
      setIsAdding(false);
    }
    setFormData({ name: '', price: 0, costPrice: 0, quantity: 0, lowStockThreshold: 5, category: '', barcode: '' });
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id!);
    setFormData({
      name: product.name,
      price: product.price,
      costPrice: product.costPrice ?? 0,
      quantity: product.quantity,
      lowStockThreshold: product.lowStockThreshold,
      category: product.category || 'General',
      barcode: product.barcode || ''
    });
  };

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
        const lines = text.split('\n');
        if (lines.length < 2) throw new Error('File is empty or missing headers');

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const required = ['name', 'price', 'quantity'];
        const missing = required.filter(r => !headers.includes(r));
        if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(', ')}`);
        
        const parsed = lines.slice(1).filter(l => l.trim()).map(line => {
          const values = line.split(',').map(v => v.trim());
          return {
            name: values[headers.indexOf('name')] || 'Unnamed Product',
            category: values[headers.indexOf('category')] || 'General',
            price: parseFloat(values[headers.indexOf('price')]) || 0,
            costPrice: parseFloat(values[headers.indexOf('cost price')]) || 0,
            quantity: parseInt(values[headers.indexOf('quantity')]) || 0,
            barcode: values[headers.indexOf('barcode')] || '',
            lowStockThreshold: 5
          };
        });
        setImportPreview(parsed);
      } catch (err: unknown) {
        if (err instanceof Error) {
          alert('Import failed: ' + err.message);
        } else {
          alert('Import failed with an unknown error.');
        }
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setIsImporting(true);
    try {
      for (const item of importPreview) {
        await addProduct(item);
      }
      setImportPreview(null);
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
            {filteredProducts.map(product => (
              <tr key={product.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px', fontWeight: 600 }} data-label="Name">{product.name}</td>
                <td style={{ padding: '16px' }} data-label="Category">{product.category || 'General'}</td>
                <td style={{ padding: '16px' }} data-label="Price">KES {product.price.toLocaleString()}</td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }} data-label="Cost">KES {(product.costPrice ?? 0).toLocaleString()}</td>
                <td style={{ padding: '16px' }} data-label="Stock">
                  <span className={`stock-badge ${product.quantity <= product.lowStockThreshold ? 'stock-low' : 'stock-ok'}`}>
                    {product.quantity} units
                  </span>
                </td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }} data-label="Threshold">{product.lowStockThreshold}</td>
                <td style={{ padding: '16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }} data-label="Actions">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => restockProduct(product.id!, 10)} className="btn-secondary" style={{ padding: '8px', minHeight: '40px' }} title="Quick Add 10" disabled={status === 'suspended'}>
                      <PackagePlus size={18} />
                    </button>
                    <button onClick={() => startEdit(product)} className="btn-secondary" style={{ padding: '8px', minHeight: '40px' }} disabled={status === 'suspended'}>
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => deleteProduct(product.id!)} className="btn-secondary" style={{ padding: '8px', minHeight: '40px', color: 'var(--danger)' }} disabled={status === 'suspended'}>
                      <Trash2 size={18} />
                    </button>
                  </div>
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
