import { Truck, Phone, Mail, MapPin, Trash2, Plus } from 'lucide-react';
import { type Supplier } from '../../db/db';

interface SupplierListProps {
  suppliers: Supplier[];
  onAddClick: () => void;
  onUpdate: (id: string, updates: Partial<Supplier>) => Promise<void>;
  onDelete: (id: string) => void;
}

export function SupplierList({ suppliers, onAddClick, onUpdate, onDelete }: SupplierListProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
      <div 
        onClick={onAddClick}
        style={{ border: '2px dashed var(--border)', borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px', cursor: 'pointer' }}
      >
        <div style={{ background: 'var(--primary)', padding: '12px', borderRadius: '50%', color: 'white' }}>
          <Plus size={24} />
        </div>
        <div style={{ fontWeight: 800 }}>Add New Supplier</div>
      </div>

      {suppliers.map(s => (
        <div key={s.id} className="card" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '12px' }}>
              <Truck color="var(--primary)" size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontWeight: 900 }}>{s.name}</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.kraPin || 'No KRA PIN'}</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Phone size={14} color="var(--text-muted)" /> 
              <span 
                contentEditable 
                suppressContentEditableWarning
                onBlur={(e) => onUpdate(s.id, { phone: (e.target as HTMLElement).innerText })}
                style={{ outline: 'none', padding: '2px 4px', borderRadius: '4px' }}
                title="Click to edit"
              >
                {s.phone}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={14} color="var(--text-muted)" /> 
              <span 
                contentEditable 
                suppressContentEditableWarning
                onBlur={(e) => onUpdate(s.id, { email: (e.target as HTMLElement).innerText })}
                style={{ outline: 'none', padding: '2px 4px', borderRadius: '4px' }}
                title="Click to edit"
              >
                {s.email || 'No Email'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={14} color="var(--text-muted)" /> 
              <span
                contentEditable 
                suppressContentEditableWarning
                onBlur={(e) => onUpdate(s.id, { contactPerson: (e.target as HTMLElement).innerText })}
                style={{ outline: 'none', padding: '2px 4px', borderRadius: '4px' }}
                title="Click to edit"
              >
                {s.contactPerson}
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => onDelete(s.id)}
            style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', color: 'var(--danger)', padding: 0 }}
            title="Delete Supplier"
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
