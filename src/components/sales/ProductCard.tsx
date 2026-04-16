import { memo } from 'react';
import { type Product } from '../../db/db';

interface ProductCardProps {
  product: Product;
  isGlowing: boolean;
  onSelect: (product: Product) => void;
}

export const ProductCard = memo(({ product, isGlowing, onSelect }: ProductCardProps) => {
  const isOutOfStock = product.quantity <= 0;
  const isLowStock = product.quantity <= (product.lowStockThreshold ?? 5);

  return (
    <div 
      className={`product-card ${isGlowing ? 'item-glow-trigger' : ''}`} 
      onClick={() => {
        if (!isOutOfStock) {
          onSelect(product);
        }
      }} 
      style={{ 
        cursor: !isOutOfStock ? 'pointer' : 'not-allowed', 
        opacity: !isOutOfStock ? 1 : 0.6,
        padding: '12px',
        background: isLowStock ? '#fff1f1' : 'var(--card)',
        borderColor: isLowStock ? '#fee2e2' : 'var(--border)'
      }}
    >
      <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2px' }}>{product.name}</div>
      <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1rem' }}>KES {product.price.toLocaleString()}</div>
      <div className={`stock-badge ${isLowStock ? 'stock-low' : 'stock-ok'}`} 
        style={{ 
          marginTop: '6px', 
          fontSize: '0.7rem', 
          fontWeight: 800,
          border: isLowStock ? '1px solid var(--danger)' : 'none',
          animation: isLowStock ? 'pulse 2s infinite' : 'none'
        }}>
        Stock: {product.quantity}
      </div>
    </div>
  );
});

ProductCard.displayName = 'ProductCard';
