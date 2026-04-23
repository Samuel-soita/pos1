import { useEffect, useRef, useState } from 'react';
import { db, type Staff } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../hooks/useAuth';
import { generateTraceableId, getDeviceId, generateNumericCode } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { useCashControl } from '../hooks/useCashControl';

import { useLayout } from '../context/LayoutContext';

// Granular Sub-components (Phase 2 SOLID)
import { StaffList } from './staff/StaffList';
import { AddStaffForm } from './staff/AddStaffForm';
import { BranchManager } from './staff/BranchManager';
import { AccessControl } from './staff/AccessControl';
import { ShiftHistory } from './staff/ShiftHistory';
import { Modal } from './shared/Modal';

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

  const { businessId, business, staffId, branchId, userType } = useAuth();
  const { requestAuth } = useLayout();
  const staffMembers = useLiveQuery(() => {
    if (!businessId) return [];
    let collection = db.staff.where('businessId').equals(businessId);
    if (userType === 'staff' && branchId) {
      collection = collection.and(s => s.branchId === branchId);
    }
    return collection.toArray();
  }, [businessId, branchId, userType]) || [];

  const shifts = useLiveQuery(() => {
    if (!businessId) return [];
    let collection = db.shifts.where('businessId').equals(businessId);
    if (userType === 'staff' && branchId) {
      collection = collection.and(s => s.branchId === branchId);
    }
    return collection.reverse().sortBy('startTime');
  }, [businessId, branchId, userType]) || [];

  const branches = useLiveQuery(() => {
    if (!businessId) return [];
    let collection = db.branches.where('businessId').equals(businessId);
    if (userType === 'staff' && branchId) {
      collection = collection.and(b => b.id === branchId);
    }
    return collection.toArray();
  }, [businessId, branchId, userType]) || [];

  const [loading, setLoading] = useState(false);
  
  // Register Control State
  const { closeRegister, expectedCash } = useCashControl();
  const [closingCash, setClosingCash] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingCash) return;
    await closeRegister(parseFloat(closingCash));
    setShowCloseModal(false);
  };

  const onAddStaff = async (formData: {
    firstName: string;
    lastName: string;
    idNumber: string;
    phoneNumber: string;
    pin: string;
    selectedBranch: string;
  }) => {
    if (!businessId) return;
    setLoading(true);

    try {
      const deviceId = await getDeviceId();
      const nextCode = generateNumericCode(6);

      const newStaff: Staff = {
        id: await generateTraceableId('STF', businessId, business?.code, deviceId),
        businessId,
        code: nextCode,
        pin: formData.pin,
        idNumber: formData.idNumber,
        phoneNumber: formData.phoneNumber,
        firstName: formData.firstName,
        lastName: formData.lastName,
        status: 'active',
        branchId: formData.selectedBranch || undefined
      };

      await db.transaction('rw', [db.staff, db.pos_events, db.counters, db.settings], async () => {
        await db.staff.add(newStaff);
        const eventHash = await generateEventHash(newStaff);
        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
          business_id: businessId,
          staff_id: staffId || 'owner',
          event_type: 'STAFF_CREATED',
          payload: newStaff,
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
      });
      
      alert(`Staff added successfully! Login Code: ${nextCode}`);
    } catch (err) {
      console.error(err);
      alert('Failed to add staff member');
    } finally {
      setLoading(false);
    }
  };

  const onAddBranch = async (name: string) => {
    if (!businessId || !business) return;
    const deviceId = await getDeviceId();
    const branchId = await generateTraceableId('BRH', businessId, business?.code, deviceId);
    const newBranch = { id: branchId, businessId, name };

    await db.transaction('rw', [db.branches, db.pos_events, db.counters, db.settings], async () => {
      await db.branches.add(newBranch);
      const eventHash = await generateEventHash(newBranch);
      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'BRANCH_CREATED',
        payload: newBranch,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  };

  const onUpdateBranch = async (id: string, newName: string) => {
    if (!businessId || !business || !newName) return;
    const deviceId = await getDeviceId();
    const payload = { id, businessId, name: newName };

    await db.transaction('rw', [db.branches, db.pos_events, db.counters, db.settings], async () => {
      await db.branches.update(id, { name: newName });
      const eventHash = await generateEventHash(payload);
      await db.pos_events.add({
        event_id: await generateTraceableId('EVT', businessId, business?.code, deviceId),
        business_id: businessId,
        staff_id: 'owner',
        event_type: 'BRANCH_UPDATED',
        payload,
        client_timestamp: Date.now(),
        server_timestamp: 0,
        hash: eventHash,
        sync_status: 'pending'
      });
    });
  };

  const onDeleteBranch = (id: string) => {
    requestAuth(async () => {
      if (confirm('Are you sure you want to remove this branch?')) {
        const deviceId = await getDeviceId();
        await db.transaction('rw', [db.branches, db.pos_events, db.counters, db.settings], async () => {
          await db.branches.delete(id);
          const payload = { id };
          const eventHash = await generateEventHash(payload);
          await db.pos_events.add({
            event_id: await generateTraceableId('EVT', businessId!, business?.code, deviceId),
            business_id: businessId!,
            staff_id: staffId || 'owner',
            event_type: 'BRANCH_DELETED',
            payload,
            client_timestamp: Date.now(),
            server_timestamp: 0,
            hash: eventHash,
            sync_status: 'pending'
          });
        });
      }
    });
  };

  const onDeleteStaff = (id: string) => {
    requestAuth(async () => {
      if (confirm('Are you sure you want to remove this staff member?')) {
        const deviceId = await getDeviceId();
        await db.transaction('rw', [db.staff, db.pos_events, db.counters, db.settings], async () => {
          await db.staff.delete(id);
          const payload = { id };
          const eventHash = await generateEventHash(payload);
          await db.pos_events.add({
            event_id: await generateTraceableId('EVT', businessId!, business?.code, deviceId),
            business_id: businessId!,
            staff_id: staffId || 'owner',
            event_type: 'STAFF_DELETED',
            payload,
            client_timestamp: Date.now(),
            server_timestamp: 0,
            hash: eventHash,
            sync_status: 'pending'
          });
        });
      }
    });
  };

  const onToggleStaffStatus = (memberID: string, currentStatus: string) => {
    requestAuth(async () => {
      const deviceId = await getDeviceId();
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const payload = { id: memberID, business_id: businessId, status: newStatus };

      await db.transaction('rw', [db.staff, db.pos_events, db.counters, db.settings], async () => {
        await db.staff.update(memberID, { status: newStatus });
        const eventHash = await generateEventHash(payload);
        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', businessId!, business?.code, deviceId),
          business_id: businessId!,
          staff_id: staffId || 'owner',
          event_type: 'STAFF_UPDATED',
          payload,
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
      });
    });
  };

  const onTogglePermission = async (permId: string) => {
    if (!business || !businessId) return;
    const currentPerms = business.staffPermissions || {
      inventory: true, expenses: true, reports: false, staff: false, settings: false, procurement: false
    };
    const newPerms = { ...currentPerms, [permId]: !currentPerms[permId] };
    const deviceId = await getDeviceId();

    requestAuth(async () => {
      await db.transaction('rw', [db.businesses, db.pos_events, db.counters, db.settings], async () => {
        await db.businesses.update(businessId, { staffPermissions: newPerms });
        const payload = { id: businessId, staff_permissions: newPerms };
        const eventHash = await generateEventHash(payload);
        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', businessId!, business?.code, deviceId),
          business_id: businessId!,
          staff_id: 'owner',
          event_type: 'BUSINESS_UPDATED',
          payload,
          client_timestamp: Date.now(),
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
      });
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Staff Management</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px' }}>
        <AddStaffForm branches={branches} onSubmit={onAddStaff} loading={loading} />
        <StaffList 
          staffMembers={staffMembers} 
          branches={branches} 
          onToggleStatus={onToggleStaffStatus} 
          onDelete={onDeleteStaff} 
        />
        <BranchManager 
          branches={branches} 
          onAdd={onAddBranch} 
          onUpdate={onUpdateBranch} 
          onDelete={onDeleteBranch} 
          branchRef={branchRef} 
        />
        <AccessControl business={business || null} onToggle={onTogglePermission} />
      </div>

      <ShiftHistory shifts={shifts} staffMembers={staffMembers} shiftRef={shiftRef} />

      <Modal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)} title="Close Register" maxWidth="400px">
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
      </Modal>
    </div>
  );
}
