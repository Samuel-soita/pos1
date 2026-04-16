import React, { useState } from 'react';
import { Receipt, Plus } from 'lucide-react';
import { playBeep } from '../../utils/audio';
import { FormInput } from '../shared/FormInput';

interface QuickLogProps {
  onSubmit: (formData: ({
    title: string;
    amount: number;
    category: string;
    receiptImage: string | null;
  })) => Promise<void>;
}

export function QuickLog({ onSubmit }: QuickLogProps) {
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
    onSubmit({ title, amount: parseFloat(amount), category, receiptImage }).then(() => {
      setStatus('success');
      setTitle('');
      setAmount('');
      setCategory('');
      playBeep();
      setTimeout(() => setStatus('idle'), 3000);
    }).catch(() => setStatus('idle'));
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
            <FormInput 
              label="Description"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Transport, Lunch"
            />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormInput 
                label="Amount (KES)"
                type="number"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
              />
              
              <div className="input-group">
                <label>Category</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {['Transport', 'Food', 'Airtime', 'Water'].map(cat => (
                    <button 
                      key={cat}
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '8px 4px', fontSize: '0.75rem', fontWeight: 700, border: category === cat ? '2px solid var(--primary)' : '' }}
                      onClick={() => setCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <input 
                  value={category} 
                  onChange={e => setCategory(e.target.value)} 
                  placeholder="or type..." 
                  list="quick-groups" 
                  required 
                />
                <datalist id="quick-groups">
                  {['Transport', 'Food', 'Airtime', 'Water', 'Supplies', 'Repair'].map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            <div className="input-group">
              <label>Attach Receipt (optional)</label>
              <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} />
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: '16px' }} disabled={status === 'saving'}>
              {status === 'saving' ? 'Verifying PIN...' : 'Confirm Log (Requires PIN)'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
