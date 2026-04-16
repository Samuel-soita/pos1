import React, { useState } from 'react';
import { Modal } from '../shared/Modal';
import { FormInput } from '../shared/FormInput';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: ({
    title: string;
    amount: number;
    category: string;
    receiptImage: string | null;
  })) => Promise<void>;
}

export function AddExpenseModal({ isOpen, onClose, onSubmit }: AddExpenseModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    category: '',
    receiptImage: null as string | null
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, receiptImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.amount || !formData.category) return;
    
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount)
    }).then(() => {
      onClose();
      setFormData({ title: '', amount: '', category: '', receiptImage: null });
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log New Expense">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormInput 
          label="Description (e.g., Rent, Transport)"
          required
          value={formData.title}
          onChange={e => setFormData({...formData, title: e.target.value})}
          placeholder="Enter description..."
        />
        
        <FormInput 
          label="Amount (KES)"
          type="number"
          required
          value={formData.amount}
          onChange={e => setFormData({...formData, amount: e.target.value})}
          placeholder="0.00"
        />

        <FormInput 
          label="Category (Type to infill)"
          required
          value={formData.category}
          onChange={e => setFormData({...formData, category: e.target.value})}
          placeholder="e.g. Utility, Logistics"
          datalistId="expense-categories"
          datalist={['Rent', 'Electricity', 'Water', 'Transport', 'Staff Salary', 'Repair', 'Other']}
        />

        <div className="input-group">
          <label>Attach Receipt (optional)</label>
          <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} style={{ fontSize: '0.8rem' }} />
          {formData.receiptImage && <p style={{ fontSize: '0.7rem', color: 'var(--success)', marginTop: '4px' }}>✓ Image captured</p>}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Expense</button>
        </div>
      </form>
    </Modal>
  );
}
