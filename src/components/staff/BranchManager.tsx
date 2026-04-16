import React, { useState } from 'react';
import { Building2, X } from 'lucide-react';
import { type Branch } from '../../db/db';

interface BranchManagerProps {
  branches: Branch[];
  onAdd: (name: string) => Promise<void>;
  onUpdate: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => void;
  branchRef: React.RefObject<HTMLDivElement | null>;
}

export function BranchManager({ branches, onAdd, onUpdate, onDelete, branchRef }: BranchManagerProps) {
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    onAdd(newName).then(() => setNewName(''));
  };

  return (
    <div className="card" ref={branchRef}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Building2 size={24} color="var(--primary)" />
        Manage Branches
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <input 
            required 
            value={newName} 
            onChange={e => setNewName(e.target.value)} 
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
            <div 
              contentEditable 
              suppressContentEditableWarning
              onBlur={(e) => onUpdate(branch.id, e.target.innerText)}
              style={{ fontWeight: 700, fontSize: '0.9rem', outline: 'none', padding: '4px' }}
            >
              {branch.name}
            </div>
            <button 
              onClick={() => onDelete(branch.id)}
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
  );
}
