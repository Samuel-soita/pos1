import { useState } from 'react';
import { useSales } from '../hooks/useSales';
import { type Sale } from '../db/db';
import { Search, Printer, FileText, X } from 'lucide-react';

export function History() {
  const { sales } = useSales();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const filteredSales = sales.filter(s => 
    s.receiptId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Transaction History</h1>
        <p style={{ color: 'var(--text-muted)' }}>View and reprint your past sales records.</p>
      </header>

      {/* Search Bar */}
      <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} size={20} />
          <input 
            type="text" 
            placeholder="Search by Receipt ID (e.g. REC-123)..." 
            style={{ paddingLeft: '44px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Transaction List */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', background: '#f8fafc' }}>
              <th style={{ padding: '16px' }}>Receipt ID</th>
              <th style={{ padding: '16px' }}>Date & Time</th>
              <th style={{ padding: '16px' }}>Items Count</th>
              <th style={{ padding: '16px' }}>Total Amount</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map(sale => (
              <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px', fontWeight: 600 }}>{sale.receiptId}</td>
                <td style={{ padding: '16px' }}>{new Date(sale.timestamp).toLocaleString()}</td>
                <td style={{ padding: '16px' }}>{sale.items.length} items</td>
                <td style={{ padding: '16px', fontWeight: 700 }}>${sale.total.toFixed(2)}</td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  <button onClick={() => setSelectedSale(sale)} className="btn-secondary" style={{ padding: '8px' }}>
                    <FileText size={18} />
                    View Receipt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Receipt Modal (Printable) */}
      {selectedSale && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '400px', padding: '0', position: 'relative' }}>
            <button 
              onClick={() => setSelectedSale(null)} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', padding: 0, color: 'var(--text-muted)' }}
              className="no-print"
            >
              <X size={24} />
            </button>
            
            <div className="receipt-container" style={{ padding: '32px' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>POS RECEIPT</h2>
                <p style={{ color: 'var(--text-muted)' }}>Simple Offline POS MVP</p>
                <div style={{ margin: '12px 0', borderTop: '1px dashed var(--border)' }}></div>
                <p><strong>Receipt #:</strong> {selectedSale.receiptId}</p>
                <p><strong>Date:</strong> {new Date(selectedSale.timestamp).toLocaleString()}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {selectedSale.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.quantity}x {item.name}</span>
                    <span>${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '2px dashed var(--border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 800 }}>
                  <span>TOTAL</span>
                  <span>${selectedSale.total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                <p>Thank you for your business!</p>
                <p>Store ID: POS-MVP-001</p>
              </div>
            </div>

            <div style={{ padding: '24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px' }} className="no-print">
              <button onClick={handlePrint} className="btn-primary" style={{ flex: 1 }}>
                <Printer size={20} />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Printing Receipts */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt-container, .receipt-container * { visibility: visible !important; }
          .receipt-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 10px;
            font-family: 'Courier New', Courier, monospace;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
