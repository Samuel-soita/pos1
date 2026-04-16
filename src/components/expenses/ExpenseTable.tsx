import { Calendar, Trash2, Clock } from 'lucide-react';
import { type Expense } from '../../db/db';

interface ExpenseTableProps {
  expenses: Expense[];
  onVerify: (id: string, status: 'verified' | 'rejected') => void;
  onDelete: (id: string) => void;
}

export function ExpenseTable({ expenses, onVerify, onDelete }: ExpenseTableProps) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}><Clock size={18} /> Recent Logs</h3>
      </div>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Category</th>
              <th style={{ textAlign: 'right', padding: '16px 24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Amount</th>
              <th style={{ textAlign: 'right', padding: '16px 24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No expenses logged.</td>
              </tr>
            ) : (
              expenses.map(exp => (
                <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)', background: exp.status === 'pending' ? '#fffbeb' : 'transparent' }}>
                  <td style={{ padding: '16px 24px', fontSize: '0.875rem' }} data-label="Date">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={14} color="var(--text-muted)" />
                      {new Date(exp.timestamp).toLocaleDateString()}
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px' }} data-label="Title">
                    <div style={{ fontWeight: 600 }}>{exp.title}</div>
                  </td>
                  <td style={{ padding: '16px 24px' }} data-label="Category">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: 'full', fontSize: '0.7rem', fontWeight: 600, width: 'fit-content' }}>
                        {exp.category}
                      </span>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: 800, 
                        color: exp.status === 'verified' ? 'var(--success)' : exp.status === 'rejected' ? 'var(--danger)' : '#b45309' 
                      }}>
                        {(exp.status || 'verified').toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }} data-label="Amount">
                    KES {exp.amount.toLocaleString()}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }} data-label="Actions">
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      {exp.status === 'pending' && (
                        <>
                          <button onClick={() => onVerify(exp.id, 'verified')} style={{ padding: '4px 8px', background: 'var(--success)', color: 'white', borderRadius: '6px', fontSize: '0.75rem' }}>Verify</button>
                          <button onClick={() => onVerify(exp.id, 'rejected')} style={{ padding: '4px 8px', background: 'var(--danger)', color: 'white', borderRadius: '6px', fontSize: '0.75rem' }}>Reject</button>
                        </>
                      )}
                      <button onClick={() => onDelete(exp.id)} style={{ padding: '8px', color: 'var(--text-muted)', background: 'transparent' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
