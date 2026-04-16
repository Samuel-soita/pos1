import React from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { type Shift, type Staff } from '../../db/db';

interface ShiftHistoryProps {
  shifts: Shift[];
  staffMembers: Staff[];
  shiftRef: React.RefObject<HTMLDivElement | null>;
}

export function ShiftHistory({ shifts, staffMembers, shiftRef }: ShiftHistoryProps) {
  return (
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
  );
}
