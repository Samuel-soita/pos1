import { Trash2, MapPin } from 'lucide-react';
import { type Staff, type Branch } from '../../db/db';

interface StaffListProps {
  staffMembers: Staff[];
  branches: Branch[];
  onToggleStatus: (id: string, currentStatus: string) => void;
  onDelete: (id: string) => void;
}

export function StaffList({ staffMembers, branches, onToggleStatus, onDelete }: StaffListProps) {
  return (
    <div className="card">
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px' }}>
        Active Staff ({staffMembers.length})
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {staffMembers.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No staff members registered yet.</p>
        ) : (
          staffMembers.map(member => {
            const branch = branches.find(b => b.id === member.branchId);
            return (
              <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '12px', opacity: member.status === 'inactive' ? 0.6 : 1 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{member.firstName} {member.lastName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 800 }}>Login Code: {member.code}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {member.idNumber} | {member.phoneNumber}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <span 
                      onClick={() => onToggleStatus(member.id, member.status)}
                      style={{ cursor: 'pointer', padding: '2px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 900, background: member.status === 'active' ? '#dcfce7' : '#fee2e2', color: member.status === 'active' ? '#166534' : '#991b1b' }}
                    >
                      {member.status.toUpperCase()}
                    </span>
                    {branch && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} /> {branch.name}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => onDelete(member.id)}
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
  );
}
