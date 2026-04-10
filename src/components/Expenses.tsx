import { useState, useCallback } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Receipt, Plus, Trash2, Calendar, Filter, TrendingDown, Clock, Repeat } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../hooks/useAuth';

export function Expenses() {
  const { businessId } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  
  // Security check - already handled by Layout but we'll double check
  const securityModeSetting = useLiveQuery(() => db.settings.get('security_mode'));
  const isOwner = securityModeSetting?.value !== 'staff';

  const expenses = useLiveQuery(
    () => db.expenses.orderBy('timestamp').reverse().toArray()
  ) || [];

  const recurringExpenses = useLiveQuery(
    () => db.recurring_expenses.toArray()
  ) || [];

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      const now = Date.now();
      await db.expenses.delete(id);
      await db.sync_queue.add({
        id: uuidv4(),
        action: 'DELETE',
        table: 'expenses',
        payload: { id },
        timestamp: now,
        status: 'pending',
        errorCount: 0
      });
    }
  }, []);

  if (!isOwner) {
    return <QuickLog businessId={businessId || ''} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Expense Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track operational costs and recurring bills.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={() => setShowRecurringModal(true)}>
            <Repeat size={20} /> <span className="desktop-only">Recurring Bills</span>
          </button>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={20} /> Log Expense
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: '#fee2e2', padding: '16px', borderRadius: '16px' }}>
            <TrendingDown size={32} color="var(--danger)" />
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Expenses (All Time)</p>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>KES {totalExpenses.toLocaleString()}</h2>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '16px' }}>
            <Repeat size={32} color="var(--primary)" />
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Active Recurring Bills</p>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{recurringExpenses.filter(r => r.isActive).length} Items</h2>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={20} /> Recent Logs</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" style={{ padding: '8px 16px', minHeight: 'auto', fontSize: '0.875rem' }}>
              <Filter size={16} /> Filter
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No expenses logged yet.</td>
                </tr>
              ) : (
                expenses.map(exp => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '16px 24px', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={14} color="var(--text-muted)" />
                        {new Date(exp.timestamp).toLocaleDateString()}
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', fontWeight: 600 }}>{exp.title}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: 'full', fontSize: '0.75rem', fontWeight: 600 }}>
                        {exp.category}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                      KES {exp.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <button onClick={() => handleDelete(exp.id)} style={{ padding: '8px', minHeight: 'auto', background: 'transparent', color: 'var(--danger)' }}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && <AddExpenseModal onClose={() => setShowAddModal(false)} businessId={businessId || ''} />}
      {showRecurringModal && <RecurringExpensesModal onClose={() => setShowRecurringModal(false)} businessId={businessId || ''} />}
    </div>
  );
}

function AddExpenseModal({ onClose, businessId }: { onClose: () => void, businessId: string }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !category) return;

    const now = Date.now();
    const newExpense = {
      id: uuidv4(),
      businessId,
      title,
      amount: parseFloat(amount),
      category,
      timestamp: now
    };

    await db.expenses.add(newExpense);
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'INSERT',
      table: 'expenses',
      payload: newExpense,
      timestamp: now,
      status: 'pending',
      errorCount: 0
    });

    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '500px' }}>
        <h2 style={{ marginBottom: '24px' }}>Log New Expense</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="input-group">
            <label>Description (e.g., Rent, Transport)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter description..." required />
          </div>
          <div className="input-group">
            <label>Amount (KES)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
          </div>
          <div className="input-group">
            <label>Category (Type to infill)</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Utility, Logistics" list="expense-categories" required />
            <datalist id="expense-categories">
              <option value="Rent" />
              <option value="Electricity" />
              <option value="Water" />
              <option value="Transport" />
              <option value="Staff Salary" />
              <option value="Repair" />
              <option value="Other" />
            </datalist>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Expense</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuickLog({ businessId }: { businessId: string }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !category) return;

    setStatus('saving');
    const now = Date.now();
    const newExpense = {
      id: uuidv4(),
      businessId,
      title,
      amount: parseFloat(amount),
      category,
      timestamp: now
    };

    await db.expenses.add(newExpense);
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'INSERT',
      table: 'expenses',
      payload: newExpense,
      timestamp: now,
      status: 'pending',
      errorCount: 0
    });

    setStatus('success');
    setTitle('');
    setAmount('');
    setCategory('');
    setTimeout(() => setStatus('idle'), 3000);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="card" style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ background: '#f1f5f9', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Receipt size={32} color="var(--primary)" />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Quick Log Expense</h2>
        <p style={{ color: 'var(--text-muted)' }}>Log day-to-day costs instantly. Only Owners can view history.</p>
      </div>

      <div className="card">
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ background: '#dcfce7', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Plus size={32} color="var(--success)" />
            </div>
            <h3 style={{ color: 'var(--success)' }}>Expense Logged Successfully!</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Wait a moment to add another...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group">
              <label>What are you paying for? (e.g. Transport, Lunch)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Description..." required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="input-group">
                <label>Amount (KES)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" required />
              </div>
              <div className="input-group">
                <label>Category</label>
                <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Food" list="quick-groups" required />
                <datalist id="quick-groups">
                  <option value="Transport" />
                  <option value="Lunch" />
                  <option value="Repair" />
                  <option value="Supplies" />
                </datalist>
              </div>
            </div>
            <button type="submit" className="btn-primary" style={{ marginTop: '16px' }} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving...' : 'Confirm Log'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RecurringExpensesModal({ onClose, businessId }: { onClose: () => void, businessId: string }) {
  const recurring = useLiveQuery(() => db.recurring_expenses.toArray()) || [];
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount) return;

    const newRec = {
      id: uuidv4(),
      businessId,
      title,
      amount: parseFloat(amount),
      category: category || 'General',
      frequency,
      nextRun: Date.now(), // Process immediately on next background check
      isActive: true
    };

    await db.recurring_expenses.add(newRec);
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'INSERT',
      table: 'recurring_expenses',
      payload: newRec,
      timestamp: Date.now(),
      status: 'pending',
      errorCount: 0
    });

    setShowForm(false);
    setTitle(''); setAmount(''); setCategory('');
  };

  const toggleActive = useCallback(async (item: { id: string; businessId: string; title: string; amount: number; category: string; frequency: 'daily' | 'weekly' | 'monthly'; nextRun: number; isActive: boolean }) => {
    const newStatus = !item.isActive;
    const now = Date.now();
    await db.recurring_expenses.update(item.id, { isActive: newStatus });
    await db.sync_queue.add({
      id: uuidv4(),
      action: 'UPDATE',
      table: 'recurring_expenses',
      payload: { ...item, isActive: newStatus },
      timestamp: now,
      status: 'pending',
      errorCount: 0
    });
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2>Recurring Bills</h2>
          <button onClick={onClose} style={{ background: 'transparent' }}>✕</button>
        </div>

        {!showForm ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recurring.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No recurring bills set up.</p>
              ) : (
                recurring.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8fafc', borderRadius: '12px', opacity: item.isActive ? 1 : 0.6 }}>
                    <div>
                      <p style={{ fontWeight: 700 }}>{item.title}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        KES {item.amount.toLocaleString()} • {item.frequency.toUpperCase()}
                      </p>
                    </div>
                    <button 
                      className={item.isActive ? "btn-secondary" : "btn-primary"} 
                      style={{ padding: '4px 12px', minHeight: 'auto', fontSize: '0.75rem' }}
                      onClick={() => toggleActive(item)}
                    >
                      {item.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                ))
              )}
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '24px' }} onClick={() => setShowForm(true)}>
              <Plus size={18} /> Add Recurring Bill
            </button>
          </>
        ) : (
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group">
              <label>Bill Name (e.g., Monthly Rent)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="input-group">
                <label>Amount (KES)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Frequency</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Back</button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }}>Create Schedule</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
