import { useState } from 'react';
import { db, type Staff } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../hooks/useAuth';
import { UserPlus, Trash2, Phone, CreditCard, User, ShieldCheck } from 'lucide-react';

export function StaffManagement() {
  const { businessId } = useAuth();
  const staffMembers = useLiveQuery(() => 
    businessId ? db.staff.where('businessId').equals(businessId).toArray() : []
  , [businessId]) || [];

  const [idNumber, setIdNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setLoading(true);

    try {
      // Generate sequential code (001, 002...)
      const count = await db.staff.where('businessId').equals(businessId).count();
      const nextCode = (count + 1).toString().padStart(3, '0');

      const newStaff: Staff = {
        id: crypto.randomUUID(),
        businessId,
        code: nextCode,
        pin,
        idNumber,
        phoneNumber,
        firstName,
        lastName,
        status: 'active'
      };

      await db.staff.add(newStaff);
      
      // Reset form
      setIdNumber('');
      setPhoneNumber('');
      setFirstName('');
      setLastName('');
      setPin('');
      alert(`Staff added successfully! Login Code: ${nextCode}`);
    } catch (err) {
      console.error(err);
      alert('Failed to add staff member');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (confirm('Are you sure you want to remove this staff member?')) {
      await db.staff.delete(id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Staff Management</h1>
        <p style={{ color: 'var(--text-muted)' }}>Manage your employees and their access codes. Each staff member costs 150 KES/mo.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px' }}>
        
        {/* Registration Form */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <UserPlus size={24} color="var(--primary)" />
            Add New Staff
          </h2>
          <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="input-group">
                <label>First Name</label>
                <div className="input-icon-wrapper">
                  <input required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" />
                  <User className="input-icon" size={18} />
                </div>
              </div>
              <div className="input-group">
                <label>Last Name</label>
                <div className="input-icon-wrapper">
                  <input required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
                  <User className="input-icon" size={18} />
                </div>
              </div>
            </div>

            <div className="input-group">
              <label>ID Number</label>
              <div className="input-icon-wrapper">
                <input required value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="12345678" />
                <CreditCard className="input-icon" size={18} />
              </div>
            </div>

            <div className="input-group">
              <label>Phone Number</label>
              <div className="input-icon-wrapper">
                <input required value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="0712345678" />
                <Phone className="input-icon" size={18} />
              </div>
            </div>

            <div className="input-group">
              <label>Assign 4-Digit Login PIN</label>
              <div className="input-icon-wrapper">
                <input 
                  required 
                  type="password" 
                  maxLength={4} 
                  value={pin} 
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))} 
                  placeholder="••••" 
                />
                <ShieldCheck className="input-icon" size={18} />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ height: '56px' }}>
              {loading ? 'Registering...' : 'Register Staff Member'}
            </button>
          </form>
        </div>

        {/* Staff List */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldCheck size={24} color="var(--primary)" />
            Active Staff ({staffMembers.length})
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {staffMembers.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No staff members registered yet.</p>
            ) : (
              staffMembers.map(member => (
                <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{member.firstName} {member.lastName}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 800 }}>Login Code: {member.code}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ID: {member.idNumber} | {member.phoneNumber}</div>
                  </div>
                  <button 
                    onClick={() => handleDeleteStaff(member.id)}
                    style={{ background: 'transparent', color: 'var(--danger)', padding: '8px' }}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
