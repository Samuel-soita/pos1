import { memo } from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface CartItemProps {
  item: { productId: string; name: string; price: number; quantity: number };
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export const CartItem = memo(({ item, onUpdateQuantity, onRemove }: CartItemProps) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '10px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>KES {(item.price).toLocaleString()}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'white' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.productId, item.quantity - 1); }} 
            style={{ padding: '2px 6px', borderRadius: 0, background: 'transparent', minHeight: '32px' }}
          >
            <Minus size={12} />
          </button>
          <span style={{ padding: '0 6px', fontWeight: 600, fontSize: '0.85rem' }}>{item.quantity}</span>
          <button 
            onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.productId, item.quantity + 1); }} 
            style={{ padding: '2px 6px', borderRadius: 0, background: 'transparent', minHeight: '32px' }}
          >
            <Plus size={12} />
          </button>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(item.productId); }} 
          style={{ color: 'var(--danger)', padding: '6px', background: 'transparent', minHeight: '32px' }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
});

CartItem.displayName = 'CartItem';
