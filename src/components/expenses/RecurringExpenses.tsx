import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { FormInput } from '../shared/FormInput';
import { type RecurringExpense } from '../../db/db';

interface RecurringExpensesProps {
  isOpen: boolean;
  onClose: () => void;
  recurring: RecurringExpense[];
  onAdd: (formData: { title: string; amount: string; category: string; frequency: 'daily' | 'weekly' | 'monthly' }) => Promise<void>;
  onToggle: (item: RecurringExpense) => Promise<void>;
}

export function RecurringExpenses({ isOpen, onClose, recurring, onAdd, onToggle }: RecurringExpensesProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    category: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData).then(() => {
      setShowForm(false);
      setFormData({ title: '', amount: '', category: '', frequency: 'monthly' });
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recurring Bills" maxWidth="600px">
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
                    onClick={() => onToggle(item)}
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
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormInput 
            label="Bill Name (e.g., Monthly Rent)"
            required
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <FormInput 
              label="Amount (KES)"
              type="number"
              required
              value={formData.amount}
              onChange={e => setFormData({...formData, amount: e.target.value})}
            />
            <div className="input-group">
              <label>Frequency</label>
              <select value={formData.frequency} onChange={e => setFormData({...formData, frequency: e.target.value as 'daily' | 'weekly' | 'monthly'})}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Back</button>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Bill</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
