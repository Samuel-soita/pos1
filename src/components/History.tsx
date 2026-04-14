import { useState } from 'react';
import { type Sale } from '../db/db';
import { Search, Printer, FileText, TrendingUp, Banknote, Calendar, Receipt, AlertCircle, RotateCcw } from 'lucide-react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../hooks/useAuth';
import { useSales } from '../hooks/useSales';

export function History() {
  const { business, userType } = useAuth();
  const { voidSale } = useSales();
  const isOwner = userType === 'owner';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [periodFilter, setPeriodFilter] = useState('Today');
  const limit = 50;

  // Optimized Fetching using useLiveQuery
  const sales = useLiveQuery(async () => {
    if (!business?.id) return [];

    if (periodFilter === 'Today') {
      const todayStart = new Date().setHours(0, 0, 0, 0);
      return await db.sales
        .where('timestamp').aboveOrEqual(todayStart)
        .and(s => s.businessId === business.id)
        .reverse()
        .toArray();
    }
    
    if (dateFilter && periodFilter === 'Date') {
      const [year, month, day] = dateFilter.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
      const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
      return await db.sales
        .where('timestamp').between(start, end)
        .and(s => s.businessId === business.id)
        .reverse()
        .toArray();
    }

    // Default: Return with limit for speed
    let results = await db.sales
      .where('businessId').equals(business.id)
      .reverse()
      .limit(limit)
      .toArray();

    if (searchTerm) {
      results = results.filter(s => s.receiptId.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return results;
  }, [periodFilter, dateFilter, searchTerm, limit, business]) || [];

  const activeSales = sales.filter(s => s.status !== 'voided');
  const totalFilteredSales = activeSales.reduce((sum, s) => sum + s.total, 0);
  const totalFilteredProfit = activeSales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
  const totalFilteredTax = activeSales.reduce((sum, s) => sum + (s.taxAmount || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Sales History</h1>
          <p style={{ color: 'var(--text-muted)' }}>Daily sales records for <strong>{business?.name}</strong>.</p>
        </div>
      </header>

      {isOwner && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#f0f9ff', borderLeft: '4px solid var(--primary)' }}>
              <Banknote size={32} color="var(--primary)" />
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Sales</p>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>KES {totalFilteredSales.toLocaleString()}</h3>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#f0fdf4', borderLeft: '4px solid #22c55e' }}>
              <TrendingUp size={32} color="#22c55e" />
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Net Profit</p>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d' }}>KES {totalFilteredProfit.toLocaleString()}</h3>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#fff7ed', borderLeft: '4px solid #f97316' }}>
              <Receipt size={32} color="#f97316" />
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tax Collected</p>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#c2410c' }}>KES {totalFilteredTax.toLocaleString()}</h3>
              </div>
            </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <label style={{ marginBottom: '8px', fontWeight: 700, fontSize: '0.875rem' }}>Search Receipts</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} size={18} />
              <input 
                type="text" 
                placeholder="REC-..." 
                style={{ paddingLeft: '40px', minHeight: '44px', fontSize: '1rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ marginBottom: '8px', fontWeight: 700, fontSize: '0.875rem' }}>Filter by Date</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type="date" 
                value={dateFilter} 
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPeriodFilter('Date');
                }}
                style={{ width: '100%', paddingLeft: '40px', minHeight: '44px', fontSize: '1rem' }}
              />
              <Calendar style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} size={18} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setPeriodFilter('Today')}
            className={periodFilter === 'Today' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1, padding: '8px', minHeight: '44px', fontSize: '0.9rem' }}
          >
            Today
          </button>
          <button 
            onClick={() => setPeriodFilter('All')}
            className={periodFilter === 'All' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1, padding: '8px', minHeight: '44px', fontSize: '0.9rem' }}
          >
            Show All
          </button>
        </div>
      </div>

      {/* Transaction List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <th style={{ padding: '16px 24px' }}>Receipt ID</th>
              <th style={{ padding: '16px 24px' }}>Time</th>
              <th style={{ padding: '16px 24px' }}>Payment</th>
              <th style={{ padding: '16px 24px' }}>Amount</th>
              <th style={{ padding: '16px 24px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map(sale => (
              <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px 24px', fontWeight: 600 }} data-label="Receipt">{sale.receiptId}</td>
                <td style={{ padding: '16px 24px' }} data-label="Time">{new Date(sale.timestamp).toLocaleTimeString()}</td>
                <td style={{ padding: '16px 24px' }} data-label="Method">
                  <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-secondary)', fontSize: '0.75rem', fontWeight: 700 }}>
                    {sale.paymentMethod === 'Split' ? 'Multi-Payment' : (sale.paymentMethod || 'Cash')}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', fontWeight: 800, textDecoration: sale.status === 'voided' ? 'line-through' : 'none', color: sale.status === 'voided' ? 'var(--text-muted)' : 'inherit' }} data-label="Amount">
                  KES {sale.total.toLocaleString()}
                  {sale.status === 'voided' && (
                    <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--danger)', fontWeight: 800, textDecoration: 'none' }}>VOIDED</span>
                  )}
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }} data-label="Actions">
                  <button onClick={() => setSelectedSale(sale)} className="btn-secondary" style={{ padding: '8px 12px', minHeight: '40px', width: '100%', justifyContent: 'center' }}>
                    <FileText size={16} /> View Receipt
                  </button>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No sales found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Receipt Modal */}
      {selectedSale && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setSelectedSale(null)}>
          <div className="card modal-responsive" style={{ padding: '0', maxWidth: '400px', background: 'white' }} onClick={e => e.stopPropagation()}>
            <div className="receipt-container" style={{ padding: '40px' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '4px' }}>{business?.name}</h2>
                {business?.address && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{business.address}</div>}
                {business?.telephone && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tel: {business.telephone}</div>}
                {business?.kraPin && <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '4px' }}>PIN: {business.kraPin}</div>}
                
                <div style={{ borderTop: '2px dashed var(--border)', margin: '16px 0' }}></div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Sales Receipt</div>
                <p style={{ fontSize: '0.9rem', margin: '2px 0' }}><strong>Receipt ID:</strong> {selectedSale.receiptId}</p>
                <p style={{ fontSize: '0.9rem', margin: '2px 0' }}><strong>Date:</strong> {new Date(selectedSale.timestamp).toLocaleString()}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {selectedSale.items?.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span>{item.quantity}x {item.name}</span>
                    <span style={{ fontWeight: 600 }}>KES {(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '2px dashed var(--border)', margin: '16px 0' }}></div>

              {selectedSale.taxAmount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>Subtotal</span>
                    <span>KES {(selectedSale.total - selectedSale.taxAmount).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>Tax (Inclusive {selectedSale.taxRate}%)</span>
                    <span>KES {selectedSale.taxAmount.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 900 }}>
                <span>TOTAL</span>
                <span>KES {selectedSale.total.toLocaleString()}</span>
              </div>
              
              <div style={{ marginTop: '16px', borderTop: '1px dashed var(--border)', paddingTop: '12px' }}>
                {selectedSale.paymentMethod === 'Split' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, margin: 0, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Payment Breakdown</p>
                    {selectedSale.splitPayments?.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>{p.method} {p.transactionCode ? `(${p.transactionCode})` : ''}</span>
                        <span style={{ fontWeight: 600 }}>KES {p.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                    Paid via {selectedSale.paymentMethod} {selectedSale.transactionCode ? `(${selectedSale.transactionCode})` : ''}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Thank you for shopping at {business?.name}!
              </div>
            </div>

              <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }} className="no-print">
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={handlePrint} className="btn-primary" style={{ flex: 1 }}>
                    <Printer size={20} /> Print Receipt
                  </button>
                  {isOwner && selectedSale.status !== 'voided' && (
                    <button 
                      onClick={() => setShowVoidConfirm(true)} 
                      className="btn-secondary" 
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    >
                      <RotateCcw size={20} /> Void
                    </button>
                  )}
                </div>

                {showVoidConfirm && (
                  <div className="fade-in" style={{ background: '#fff1f2', padding: '16px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', marginBottom: '12px' }}>
                      <AlertCircle size={18} />
                      <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Reason for Voiding?</span>
                    </div>
                    <input 
                      autoFocus
                      placeholder="e.g. Wrong items / Customer cancelled"
                      value={voidReason}
                      onChange={e => setVoidReason(e.target.value)}
                      style={{ background: 'white', marginBottom: '12px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        disabled={!voidReason || isVoiding}
                        onClick={async () => {
                          setIsVoiding(true);
                          await voidSale(selectedSale.id, voidReason);
                          setIsVoiding(false);
                          setShowVoidConfirm(false);
                          setSelectedSale(null);
                        }}
                        className="btn-primary" 
                        style={{ background: 'var(--danger)', flex: 1, fontSize: '0.8rem' }}
                      >
                        {isVoiding ? 'Voiding...' : 'Confirm Void'}
                      </button>
                      <button 
                        onClick={() => setShowVoidConfirm(false)}
                        className="btn-secondary" 
                        style={{ flex: 1, fontSize: '0.8rem' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <button onClick={() => { setSelectedSale(null); setShowVoidConfirm(false); }} className="btn-secondary">Close</button>
              </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt-container, .receipt-container * { visibility: visible !important; }
          .receipt-container {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
