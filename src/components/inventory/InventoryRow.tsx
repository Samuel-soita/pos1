import { memo } from 'react';
import { FileText, PackagePlus, Edit2, Trash2 } from 'lucide-react';
import { type Product } from '../../db/db';

interface InventoryRowProps {
  product: Product;
  status: string;
  onAudit: (product: Product) => void;
  onRestock: (id: string, delta: number) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
}

export const InventoryRow = memo(({ 
  product, 
  status, 
  onAudit, 
  onRestock, 
  onEdit, 
  onDelete 
}: InventoryRowProps) => {
  const isLowStock = product.quantity <= (product.lowStockThreshold ?? 5);

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '16px', fontWeight: 600 }} data-label="Name">{product.name}</td>
      <td style={{ padding: '16px' }} data-label="Category">{product.category || 'General'}</td>
      <td style={{ padding: '16px' }} data-label="Price">KES {product.price.toLocaleString()}</td>
      <td style={{ padding: '16px', color: 'var(--text-muted)' }} data-label="Cost">KES {(product.costPrice ?? 0).toLocaleString()}</td>
      <td style={{ padding: '16px' }} data-label="Stock">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => onRestock(product.id!, -1)} 
            className="btn-secondary" 
            style={{ padding: '0', minWidth: '32px', minHeight: '32px', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 900 }}
            disabled={status === 'suspended' || product.quantity <= 0}
          >
            −
          </button>
          <span className={`stock-badge ${isLowStock ? 'stock-low' : 'stock-ok'}`} style={{ minWidth: '80px', textAlign: 'center' }}>
            {product.quantity} units
          </span>
          <button 
            onClick={() => onRestock(product.id!, 1)} 
            className="btn-secondary" 
            style={{ padding: '0', minWidth: '32px', minHeight: '32px', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 900 }}
            disabled={status === 'suspended'}
          >
            +
          </button>
        </div>
      </td>
      <td style={{ padding: '16px', color: 'var(--text-muted)' }} data-label="Threshold">{product.lowStockThreshold}</td>
      <td style={{ padding: '16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }} data-label="Actions">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => onAudit(product)} 
            className="btn-secondary" 
            style={{ padding: '8px', minHeight: '40px' }} 
            title="Audit Stock" 
            disabled={status === 'suspended'}
          >
            <FileText size={18} />
          </button>
          <button 
            onClick={() => onRestock(product.id!, 10)} 
            className="btn-secondary" 
            style={{ padding: '8px', minHeight: '40px' }} 
            title="Quick Add 10" 
            disabled={status === 'suspended'}
          >
            <PackagePlus size={18} />
          </button>
          <button 
            onClick={() => onEdit(product)} 
            className="btn-secondary" 
            style={{ padding: '8px', minHeight: '40px' }} 
            disabled={status === 'suspended'}
          >
            <Edit2 size={18} />
          </button>
          <button 
            onClick={() => onDelete(product.id!)} 
            className="btn-secondary" 
            style={{ padding: '8px', minHeight: '40px', color: 'var(--danger)' }} 
            disabled={status === 'suspended'}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
});

InventoryRow.displayName = 'InventoryRow';
