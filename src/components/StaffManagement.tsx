import { useEffect, useRef, useState } from 'react';
import { db, type Staff, type Shift } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../hooks/useAuth';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { UserPlus, Trash2, Phone, CreditCard, User, ShieldCheck, History as HistoryIcon, MapPin, Building2, X, Lock, Unlock } from 'lucide-react';
import { useCashControl } from '../hooks/useCashControl';
import { supabase } from '../lib/supabase';

export function StaffManagement({ initialView }: { initialView?: string }) {
  const shiftRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialView === 'shifts' && shiftRef.current) {
      shiftRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (initialView === 'branches' && branchRef.current) {
      branchRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [initialView]);

  const { businessId, business } = useAuth();
  const staffMembers = useLiveQuery(() => 
    businessId ? db.staff.where('businessId').equals(businessId).toArray() : []
  , [businessId]) || [];

  const shifts = useLiveQuery(() => 
    businessId ? db.shifts.where('businessId').equals(businessId).reverse().sortBy('startTime') : []
  , [businessId]) || [];

  const [idNumber, setIdNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pin, setPin] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Register Control State
  const { isRegisterOpen, currentLog, openRegister, closeRegister, getExpectedCash } = useCashControl();
  const [openingFloat, setOpeningFloat] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [expectedCash, setExpectedCash] = useState(0);

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingFloat) return;
    await openRegister(parseFloat(openingFloat));
    setOpeningFloat('');
  };

  const handleShowClose = async () => {
    const expected = await getExpectedCash();
    setExpectedCash(expected);
    setShowCloseModal(true);
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingCash) return;
    await closeRegister(parseFloat(closingCash));
    setShowCloseModal(false);
  };

  const branches = useLiveQuery(() => 
    businessId ? db.branches.where('businessId').equals(businessId).toArray() : []
  , [businessId]) || [];

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setLoading(true);

    try {
      const deviceId = await getDeviceId();
      
      // 1. Fetch the official sequential code from the cloud (001, 002...)
      const { data: nextCode, error: codeError } = await supabase.rpc('get_next_staff_code', { 
        p_business_id: businessId 
      });

      if (codeError) throw new Error(`Staff Code Generation Failed: ${codeError.message}`);

      const newStaff: Staff = {
        id: await generateTraceableId('STF', businessId, business!.code, deviceId),
        businessId,
        code: nextCode,
        pin,
        idNumber,
        phoneNumber,
        firstName,
        lastName,
        status: 'active',
        branchId: selectedBranch || undefined
      };

      await db.transaction('rw', [db.staff, db.pos_events, db.counters, db.settings], async () => {
        await db.staff.add(newStaff);
        await db.pos_events.add({
          event_id: await generateTraceableId('ORD', businessId, business!.code, deviceId),
          business_id: businessId,
          staff_id: 'owner',
          event_type: 'STAFF_CREATED',
          payload: newStaff,
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: 'LATER',
          sync_status: 'pending'
        });
      });
      
      setFirstName('');
      setLastName('');
      setPin('');
      setIdNumber('');
      setPhoneNumber('');
      setSelectedBranch('');
      alert(`Staff added successfully! Login Code: ${nextCode}`);
    } catch (err) {
      console.error(err);
      alert('Failed to add staff member');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !newBranchName || !business) return;
    const deviceId = await getDeviceId();
    const branchId = await generateTraceableId('BRH', businessId, business.code, deviceId);
    const newBranch = {
      id: branchId,
      businessId,
      name: newBranchName
    };

    await db.transaction('rw', [db.branches, db.pos_events, db.counters, db.settings], async () => {
      await db.branches.add(newBranch);
      await db.pos_events.add({
        event_id: await generateTraceableId('ORD', businessId, business.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'BRANCH_CREATED',
        payload: newBranch,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: 'LATER',
        sync_status: 'pending'
      });
    });
    setNewBranchName('');
  };

  const handleDeleteBranch = async (id: string) => {
    if (!businessId || !business) return;
    if (confirm('Are you sure you want to remove this branch?')) {
      const deviceId = await getDeviceId();
      await db.transaction('rw', [db.branches, db.pos_events, db.counters, db.settings], async () => {
        await db.branches.delete(id);
        await db.pos_events.add({
          event_id: await generateTraceableId('ORD', businessId, business.code, deviceId),
          business_id: businessId,
          staff_id: 'owner',
          event_type: 'BRANCH_DELETED',
          payload: { id },
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: 'LATER',
          sync_status: 'pending'
        });
      });
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!businessId || !business) return;
    if (confirm('Are you sure you want to remove this staff member?')) {
      const deviceId = await getDeviceId();
      await db.transaction('rw', [db.staff, db.pos_events, db.counters, db.settings], async () => {
        await db.staff.delete(id);
        await db.pos_events.add({
          event_id: await generateTraceableId('ORD', businessId, business.code, deviceId),
          business_id: businessId,
          staff_id: 'owner',
          event_type: 'STAFF_DELETED',
          payload: { id },
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: 'LATER',
          sync_status: 'pending'
        });
      });
    }
  };

  const togglePermission = async (permId: string) => {
    if (!business || !businessId) return;
    
    const currentPerms = business.staffPermissions || {
      inventory: true, expenses: true, reports: false, staff: false, settings: false, procurement: false
    };
    
    const newPerms = { ...currentPerms, [permId]: !currentPerms[permId] };
    const deviceId = await getDeviceId();

    // Optimistic Update locally
    await db.transaction('rw', [db.businesses, db.pos_events, db.counters], async () => {
      await db.businesses.update(businessId, { staffPermissions: newPerms });
      await db.pos_events.add({
        event_id: await generateTraceableId('SYS', businessId, business.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'BUSINESS_UPDATED',
        payload: { id: businessId, staff_permissions: newPerms },
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: 'LATER',
        sync_status: 'pending'
      });
    });
  };

  const permissionsList = [
    { id: 'inventory', label: 'Stocks & Inventory', desc: 'Allow staff to see and count stock' },
    { id: 'expenses', label: 'Expenses', desc: 'Allow staff to view/record expenses' },
    { id: 'procurement', label: 'Suppliers and Purchases', desc: 'Suppliers & bulk restocking access' },
    { id: 'reports', label: 'Reports', desc: 'Allow staff to see sales reports' },
    { id: 'staff', label: 'Staff Management', desc: 'Allow managers to view shift logs' },
    { id: 'settings', label: 'Settings', desc: 'Access to business profile & PINs' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* 1. Register Control Banner (Migrated from Dashboard) */}
      <section className="glass-shift-banner" style={{ border: isRegisterOpen ? '2px solid var(--success)' : '2px solid var(--danger)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ background: isRegisterOpen ? 'var(--success)' : 'var(--danger)', padding: '12px', borderRadius: '12px', color: 'white' }}>
              {isRegisterOpen ? <Unlock size={24} /> : <Lock size={24} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem' }}>Shift Status: {isRegisterOpen ? 'OPEN' : 'LOCKED'}</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {isRegisterOpen ? `Current float: KES ${currentLog?.openingFloat.toLocaleString()}` : 'Business is closed. Start a shift to record sales.'}
              </p>
            </div>
          </div>
          
          {!isRegisterOpen ? (
            <form onSubmit={handleOpenRegister} style={{ display: 'flex', gap: '12px' }}>
              <input 
                type="number" 
                placeholder="Opening Float..." 
                value={openingFloat}
                onChange={e => setOpeningFloat(e.target.value)}
                style={{ width: '150px', background: 'white', border: '2px solid var(--border)' }}
                required
              />
              <button type="submit" className="btn-primary" style={{ height: '56px' }}>Open Register</button>
            </form>
          ) : (
            <button className="btn-danger" onClick={handleShowClose}>End Business Day</button>
          )}
        </div>
      </section>

      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Staff Management</h1>
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

            <div className="input-group">
              <label>Assign to Branch (Optional)</label>
              <div className="input-icon-wrapper">
                <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
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
              staffMembers.map(member => {
                const branch = branches.find(b => b.id === member.branchId);
                return (
                  <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{member.firstName} {member.lastName}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 800 }}>Login Code: {member.code}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {member.idNumber} | {member.phoneNumber}</div>
                      {branch && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <MapPin size={12} /> {branch.name}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => handleDeleteStaff(member.id)}
                      style={{ background: 'transparent', color: 'var(--danger)', padding: '8px' }}
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Branch Management Section */}
        <div className="card" ref={branchRef}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Building2 size={24} color="var(--primary)" />
            Manage Branches
          </h2>

          <form onSubmit={handleAddBranch} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
              <input 
                required 
                value={newBranchName} 
                onChange={e => setNewBranchName(e.target.value)} 
                placeholder="Branch Name (e.g. Westside Mall)" 
              />
            </div>
            <button type="submit" className="btn-primary" style={{ height: '44px', padding: '0 16px' }}>
              Add Branch
            </button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            {branches.map(branch => (
              <div key={branch.id} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{branch.name}</div>
                <button 
                  onClick={() => handleDeleteBranch(branch.id)}
                  style={{ background: 'transparent', color: 'var(--danger)', padding: 0 }}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {branches.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No branches defined yet.</p>
            )}
          </div>
        </div>

        {/* 4. Staff Access Control Section (OWNER ONLY) */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldCheck size={24} color="var(--primary)" />
            Staff Access Control
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
            Choose which modules your staff can access. Permissions apply globally to all staff devices.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {permissionsList.map((perm) => {
              const isEnabled = business?.staffPermissions?.[perm.id] ?? false;
              return (
                <div 
                  key={perm.id} 
                  onClick={() => togglePermission(perm.id)}
                  style={{ 
                    padding: '20px', 
                    borderRadius: '16px', 
                    border: '2px solid', 
                    borderColor: isEnabled ? 'var(--primary)' : 'var(--border)',
                    background: isEnabled ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: isEnabled ? 'var(--primary)' : 'var(--text)' }}>
                      {perm.label}
                    </div>
                    <div style={{ 
                      width: '24px', 
                      height: '24px', 
                      borderRadius: '50%', 
                      background: isEnabled ? 'var(--primary)' : 'var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white'
                    }}>
                      {isEnabled ? '✓' : ''}
                    </div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                    {perm.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Shift History Section */}
      <div className="card" ref={shiftRef}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HistoryIcon size={24} color="var(--primary)" />
          Shift History & Logs
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', background: '#f8fafc' }}>
                <th style={{ padding: '16px' }}>Staff Member</th>
                <th style={{ padding: '16px' }}>Start Time</th>
                <th style={{ padding: '16px' }}>End Time</th>
                <th style={{ padding: '16px' }}>Total Sales</th>
                <th style={{ padding: '16px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No shift records found.</td>
                </tr>
              ) : (
                shifts.map((shift: Shift) => {
                  const staff = staffMembers.find((s: Staff) => s.id === shift.staffId);
                  return (
                    <tr key={shift.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 700 }}>{staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown Staff'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Code: {staff?.code}</div>
                      </td>
                      <td style={{ padding: '16px', fontSize: '0.85rem' }}>
                        {new Date(shift.startTime).toLocaleString()}
                      </td>
                      <td style={{ padding: '16px', fontSize: '0.85rem' }}>
                        {shift.endTime ? new Date(shift.endTime).toLocaleString() : '-- Active --'}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 800 }}>KES {shift.totalSales.toLocaleString()}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          C: {shift.cashSales.toLocaleString()} | M: {shift.mpesaSales.toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ 
                          padding: '4px 10px', 
                          borderRadius: '12px', 
                          fontSize: '0.7rem', 
                          fontWeight: 700,
                          background: shift.status === 'active' ? '#dcfce7' : '#f1f5f9',
                          color: shift.status === 'active' ? '#166534' : '#64748b'
                        }}>
                          {shift.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Close Register Modal */}
      {showCloseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', animation: 'auth-fade 0.3s ease-out' }}>
            <h2 style={{ marginBottom: '24px', fontWeight: 900 }}>Close Register</h2>
            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600 }}>Expected Cash:</span>
                <span style={{ fontWeight: 900, color: 'var(--primary)' }}>KES {expectedCash.toLocaleString()}</span>
              </div>
              <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--text-muted)' }}>Calculation: Opening Float + Cash Sales - Expenses.</p>
            </div>
            <form onSubmit={handleCloseRegister} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group">
                <label>Actual Cash in Drawer</label>
                <input 
                  type="number" 
                  value={closingCash} 
                  onChange={e => setClosingCash(e.target.value)} 
                  required 
                  placeholder="0.00" 
                  style={{ height: '64px', fontSize: '1.5rem', fontWeight: 800, textAlign: 'center' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowCloseModal(false)}>Cancel</button>
                <button type="submit" className="btn-danger" style={{ flex: 1 }}>Confirm Close</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
