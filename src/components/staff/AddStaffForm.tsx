import { useState } from 'react';
import { UserPlus, MapPin } from 'lucide-react';
import { type Branch } from '../../db/db';
import { FormInput } from '../shared/FormInput';

interface AddStaffFormProps {
  branches: Branch[];
  onSubmit: (formData: ({
    firstName: string;
    lastName: string;
    idNumber: string;
    phoneNumber: string;
    pin: string;
    selectedBranch: string;
  })) => Promise<void>;
  loading: boolean;
}

export function AddStaffForm({ branches, onSubmit, loading }: AddStaffFormProps) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    idNumber: '',
    phoneNumber: '',
    pin: '',
    selectedBranch: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData).then(() => {
      setFormData({
        firstName: '',
        lastName: '',
        idNumber: '',
        phoneNumber: '',
        pin: '',
        selectedBranch: ''
      });
    });
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <UserPlus size={24} color="var(--primary)" />
        Add New Staff
      </h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FormInput 
            label="First Name"
            required
            value={formData.firstName}
            onChange={e => setFormData({...formData, firstName: e.target.value})}
            placeholder="John"
          />
          <FormInput 
            label="Last Name"
            required
            value={formData.lastName}
            onChange={e => setFormData({...formData, lastName: e.target.value})}
            placeholder="Doe"
          />
        </div>

        <FormInput 
          label="ID Number"
          required
          value={formData.idNumber}
          onChange={e => setFormData({...formData, idNumber: e.target.value})}
          placeholder="12345678"
        />

        <FormInput 
          label="Phone Number"
          required
          value={formData.phoneNumber}
          onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
          placeholder="0712345678"
        />

        <FormInput 
          label="Assign 4-Digit Login PIN"
          required
          type="text"
          maxLength={4}
          value={formData.pin}
          onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})}
          placeholder="0000"
          style={{ fontSize: '1.25rem', letterSpacing: '4px', textAlign: 'center', background: '#f8fafc', border: '2px solid var(--primary)' }}
        />

        <div className="input-group">
          <label>Assign to Branch (Optional)</label>
          <div className="input-icon-wrapper">
            <select value={formData.selectedBranch} onChange={e => setFormData({...formData, selectedBranch: e.target.value})}>
              <option value="">Main / Unassigned</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <MapPin className="input-icon" size={18} />
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={loading} style={{ height: '56px' }}>
          {loading ? 'Registering...' : 'Register Staff Member'}
        </button>
      </form>
    </div>
  );
}
