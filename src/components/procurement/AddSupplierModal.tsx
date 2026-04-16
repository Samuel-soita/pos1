import React, { useState } from 'react';
import { Modal } from '../shared/Modal';
import { FormInput } from '../shared/FormInput';

interface AddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (supplier: { name: string; contact: string; phone: string; email: string; pin: string }) => Promise<void>;
}

export function AddSupplierModal({ isOpen, onClose, onSubmit }: AddSupplierModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    phone: '',
    email: '',
    pin: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData).then(() => {
      setFormData({ name: '', contact: '', phone: '', email: '', pin: '' });
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register Supplier" maxWidth="450px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormInput 
          label="Company Name"
          required
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FormInput 
            label="Phone"
            required
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
          />
          <FormInput 
            label="KRA PIN"
            value={formData.pin}
            onChange={e => setFormData({ ...formData, pin: e.target.value })}
          />
        </div>
        
        <FormInput 
          label="Contact Person / Location"
          value={formData.contact}
          onChange={e => setFormData({ ...formData, contact: e.target.value })}
        />
        
        <FormInput 
          label="Email Address"
          type="email"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
        />
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" style={{ flex: 1 }}>Add Supplier</button>
        </div>
      </form>
    </Modal>
  );
}
