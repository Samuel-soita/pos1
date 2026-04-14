import { useState, useCallback } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Receipt, Plus, Trash2, Calendar, Filter, TrendingDown, Clock, Repeat } from 'lucide-react';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { playBeep } from '../utils/audio';
import { useAuth } from '../hooks/useAuth';

export function Expenses({ initialView }: { initialView?: string }) {
  const { businessId, business } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(initialView === 'recurring');
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  
  // Security check - already handled by Layout but we'll double check
  const securityModeSetting = useLiveQuery(() => db.settings.get('security_mode'));
  const isOwner = securityModeSetting?.value !== 'staff';

  const expenses = useLiveQuery(
    () => {
      const query = db.expenses.orderBy('timestamp').reverse();
      if (filter !== 'all') {
        return db.expenses.where('status').equals(filter).reverse().sortBy('timestamp');
      }
      return query.toArray();
    }, [filter]
  ) || [];

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = useLiveQuery(() => db.expenses.where('status').equals('pending').count()) || 0;

  const handleVerify = useCallback(async (id: string, status: 'verified' | 'rejected') => {
    const now = Date.now();
    await db.transaction('rw', db.expenses, db.pos_events, db.counters, db.settings, async () => {
      await db.expenses.update(id, { 
        status, 
        verifiedAt: now,
        verifiedBy: 'owner' 
      });
      const updated = await db.expenses.get(id);
      const deviceId = await getDeviceId();
      
      const payload = updated;
      const eventHash = await generateEventHash(payload);

      await db.pos_events.add({
        event_id: await generateTraceableId('EXP', businessId!, business!.code, deviceId),
        business_id: businessId!,
        staff_id: 'owner',
        event_type: 'EXPENSE_UPDATED',
        payload,
        client_timestamp: now,
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
      playBeep();
    });
  }, [businessId, business]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      const now = Date.now();
      const deviceId = await getDeviceId();
      await db.transaction('rw', db.expenses, db.pos_events, db.counters, db.settings, async () => {
          await db.expenses.delete(id);
          
          const payload = { id };
          const eventHash = await generateEventHash(payload);

          await db.pos_events.add({
            event_id: await generateTraceableId('EXP', businessId!, business!.code, deviceId),
            business_id: businessId!,
            staff_id: 'owner',
            event_type: 'EXPENSE_DELETED',
            payload,
            client_timestamp: now,
            server_timestamp: 0,
            hash: eventHash,
            sync_status: 'pending'
          });
          playBeep();
        });
    }
  }, [businessId, business]);

  if (!isOwner) {
    return <QuickLog businessId={businessId || ''} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Expenses</h1>
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
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer', border: filter === 'pending' ? '2px solid var(--primary)' : '1px solid var(--border)' }} onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}>
          <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '16px' }}>
            <Clock size={32} color="#b45309" />
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Pending Verification</p>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{pendingCount} Items</h2>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}><Clock size={18} /> Recent Logs</h3>
          <button className="btn-secondary" style={{ padding: '6px 12px', minHeight: '36px', fontSize: '0.8rem' }}>
            <Filter size={14} /> Filter
          </button>
        </div>
        <div style={{ width: '100%' }}>
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
                      {exp.receiptImage && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', cursor: 'pointer', marginTop: '4px' }} onClick={() => alert('View receipt image placeholder')}>
                          View Receipt 📷
                        </div>
                      )}
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
                            <button onClick={() => handleVerify(exp.id, 'verified')} style={{ padding: '4px 8px', background: 'var(--success)', color: 'white', borderRadius: '6px', fontSize: '0.75rem' }}>Verify</button>
                            <button onClick={() => handleVerify(exp.id, 'rejected')} style={{ padding: '4px 8px', background: 'var(--danger)', color: 'white', borderRadius: '6px', fontSize: '0.75rem' }}>Reject</button>
                          </>
                        )}
                        <button onClick={() => handleDelete(exp.id)} style={{ padding: '8px', color: 'var(--text-muted)' }}>
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

      {showAddModal && <AddExpenseModal onClose={() => setShowAddModal(false)} businessId={businessId || ''} />}
      {showRecurringModal && <RecurringExpensesModal onClose={() => setShowRecurringModal(false)} businessId={businessId || ''} />}
    </div>
  );
}

function AddExpenseModal({ onClose, businessId }: { onClose: () => void, businessId: string }) {
  const { userType, business } = useAuth();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !category) return;

    const now = Date.now();
    const deviceId = await getDeviceId();

    await db.transaction('rw', db.expenses, db.pos_events, db.counters, db.settings, async () => {
      const id = await generateTraceableId('EXP', businessId, business!.code, deviceId);
      const newExpense = {
        id,
        businessId,
        title,
        amount: parseFloat(amount),
        category,
        timestamp: now,
        receiptImage: receiptImage || undefined,
        description: title,
        status: (userType === 'owner' ? 'verified' : 'pending') as 'pending' | 'verified' | 'rejected',
        syncStatus: 'pending' as const
      };

      await db.expenses.add(newExpense);
      const payload = newExpense;
      const eventHash = await generateEventHash(payload);
      await db.pos_events.add({
        event_id: await generateTraceableId('EXP', businessId, business!.code, deviceId),
        business_id: businessId,
        staff_id: userType || 'unknown',
        event_type: 'EXPENSE_CREATED',
        payload,
        client_timestamp: now,
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
      playBeep();
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
          <div className="input-group">
            <label>Attach Receipt (optional)</label>
            <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} style={{ fontSize: '0.8rem' }} />
            {receiptImage && <p style={{ fontSize: '0.7rem', color: 'var(--success)', marginTop: '4px' }}>✓ Image captured</p>}
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
  const { userType, business } = useAuth();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success'>('idle');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !category) return;

    setStatus('saving');
    const now = Date.now();
    const deviceId = await getDeviceId();
    
    await db.transaction('rw', db.expenses, db.pos_events, db.counters, db.settings, async () => {
      const id = await generateTraceableId('EXP', businessId, business!.code, deviceId);
      const newExpense = {
        id,
        businessId,
        title,
        amount: parseFloat(amount),
        category,
        timestamp: now,
        receiptImage: receiptImage || undefined,
        description: title,
        status: (userType === 'owner' ? 'verified' : 'pending') as 'pending' | 'verified' | 'rejected',
        syncStatus: 'pending' as const
      };

      await db.expenses.add(newExpense);
      const payload = newExpense;
      const eventHash = await generateEventHash(payload);
      await db.pos_events.add({
        event_id: await generateTraceableId('EXP', businessId, business!.code, deviceId),
        business_id: businessId,
        staff_id: userType || 'unknown',
        event_type: 'EXPENSE_CREATED',
        payload,
        client_timestamp: now,
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
      playBeep();
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
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Quick Log</h2>
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
              <label>Description</label>
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
            <div className="input-group">
              <label>Attach Receipt (optional)</label>
              <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} />
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
  const { business } = useAuth();
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount) return;

    const now = Date.now();
    const deviceId = await getDeviceId();
    const id = await generateTraceableId('EXP', businessId, business!.code, deviceId);

    const newRec = {
      id,
      businessId,
      title,
      amount: parseFloat(amount),
      category: category || 'General',
      frequency,
      nextRun: now, // Process immediately on next background check
      isActive: true,
      syncStatus: 'pending' as const
    };

    await db.recurring_expenses.add(newRec);

    const payload = newRec;
    const eventHash = await generateEventHash(payload);

    await db.pos_events.add({
      event_id: await generateTraceableId('EXP', businessId, business!.code, deviceId),
      business_id: businessId,
      staff_id: 'owner',
      event_type: 'RECURRING_EXPENSE_CREATED',
      payload,
      client_timestamp: now,
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
    playBeep();

    setShowForm(false);
    setTitle(''); setAmount(''); setCategory('');
  };

  const toggleActive = useCallback(async (item: { id: string; businessId: string; title: string; amount: number; category: string; frequency: 'daily' | 'weekly' | 'monthly'; nextRun: number; isActive: boolean }) => {
    const newStatus = !item.isActive;
    const now = Date.now();
    // const { business } = useAuth();
    const deviceId = await getDeviceId();

    await db.recurring_expenses.update(item.id, { isActive: newStatus });
    
    const payload = { ...item, isActive: newStatus };
    const eventHash = await generateEventHash(payload);

    await db.pos_events.add({
      event_id: await generateTraceableId('EXP', businessId, business!.code, deviceId),
      business_id: businessId,
      staff_id: 'owner',
      event_type: 'RECURRING_EXPENSE_UPDATED',
      payload,
      client_timestamp: now,
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
    playBeep();
  }, [businessId, business]);

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
