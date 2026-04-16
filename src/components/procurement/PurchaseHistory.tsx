import { type Purchase, type Supplier } from '../../db/db';

interface PurchaseHistoryProps {
  purchases: Purchase[];
  suppliers: Supplier[];
}

export function PurchaseHistory({ purchases, suppliers }: PurchaseHistoryProps) {
  return (
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
          {purchases.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No restock records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
