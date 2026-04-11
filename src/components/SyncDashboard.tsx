import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { 
  Cloud, 
  CloudOff, 
  AlertCircle,
  RefreshCw,
  Trash2,
  CheckCircle2,
  ServerCrash
} from 'lucide-react';
import { useSync } from '../hooks/useSync';

export function SyncDashboard() {
  const { isOnline, isSyncing, syncAll } = useSync();
  const [selectedError, setSelectedError] = useState<string | null>(null);

  // Queries for the Sync Queue
  const pendingCount = useLiveQuery(() => db.sync_queue.count()) || 0;
  
  // Queries for DLQ
  const dlqItems = useLiveQuery(() => db.dlq.toArray()) || [];
  
  const handleRetry = async (itemId: string) => {
    const item = await db.dlq.get(itemId);
    if (!item) return;

    // Restore to active queue
    await db.sync_queue.add({
      id: item.id,
      table: item.tableName as 'sales' | 'products' | 'inventory_ledger' | 'expenses' | 'staff' | 'shifts' | 'branches' | 'payment_requests' | 'recurring_expenses' | 'purchases' | 'businesses',
      action: item.payload?.action || 'INSERT',
      payload: item.payload,
      timestamp: Date.now(),
      status: 'pending',
      errorCount: 0
    });

    // Remove from DLQ
    await db.dlq.delete(itemId);
    
    // Trigger sync
    if (isOnline) {
      syncAll();
    }
  };

  const handleDelete = async (itemId: string) => {
    if (confirm('Are you sure you want to permanently delete this failed backup? This data will be lost.')) {
      await db.dlq.delete(itemId);
    }
  };

  const handleRetryAll = async () => {
    for (const item of dlqItems) {
      await handleRetry(item.id);
    }
  };

  return (
    <div className="card" style={{ padding: 'min(24px, 5vw)', border: '2px solid var(--border)' }}>
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ServerCrash size={24} color={dlqItems.length > 0 ? "var(--danger)" : "var(--primary)"} />
            Cloud Sync Health
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Monitor background backups and resolve network failures.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '8px 16px', 
            background: isOnline ? '#dcfce7' : '#fee2e2', 
            color: isOnline ? '#166534' : '#991b1b', 
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: 700
          }}>
            {isOnline ? <Cloud size={16} /> : <CloudOff size={16} />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
          
          <button 
            className="btn-secondary" 
            onClick={syncAll}
            disabled={isSyncing || !isOnline}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={16} className={isSyncing ? "spin-animation" : ""} />
            {isSyncing ? 'Syncing...' : 'Force Sync'}
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '50%' }}>
            <Cloud size={24} color="#4f46e5" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Pending Backups</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{pendingCount}</h3>
          </div>
        </div>

        <div style={{ background: dlqItems.length > 0 ? '#fef2f2' : '#f0fdf4', padding: '20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px', border: dlqItems.length > 0 ? '1px dashed var(--danger)' : '1px solid #dcfce7' }}>
          <div style={{ background: dlqItems.length > 0 ? '#fee2e2' : '#dcfce7', padding: '12px', borderRadius: '50%' }}>
            {dlqItems.length > 0 ? <AlertCircle size={24} color="#dc2626" /> : <CheckCircle2 size={24} color="#166534" />}
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: dlqItems.length > 0 ? '#b91c1c' : '#166534' }}>Stuck Items (DLQ)</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: dlqItems.length > 0 ? '#991b1b' : '#14532d' }}>{dlqItems.length}</h3>
          </div>
        </div>
      </div>

      {dlqItems.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)' }}>Failed Backups Require Attention</h3>
            <button className="btn-primary" onClick={handleRetryAll} style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
              Retry All
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {dlqItems.map(item => (
              <div key={item.id} style={{ border: '1px solid #fee2e2', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ background: '#fef2f2', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, color: '#991b1b' }}>
                        Table: {item.tableName}
                      </span>
                      {/* Error Classification Badge */}
                      <span style={{ 
                        fontSize: '0.65rem', 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        fontWeight: 700,
                        background: (item.errorMessage || '').includes('PGRST116') || (item.errorMessage || '').includes('JWT') ? '#fef08a' :
                                    (item.errorMessage || '').includes('duplicate') ? '#e0e7ff' :
                                    (item.errorMessage || '').toLowerCase().includes('network') || (item.errorMessage || '').toLowerCase().includes('fetch') ? '#dcfce7' : '#fecaca',
                        color: (item.errorMessage || '').includes('PGRST116') || (item.errorMessage || '').includes('JWT') ? '#854d0e' :
                               (item.errorMessage || '').includes('duplicate') ? '#3730a3' :
                               (item.errorMessage || '').toLowerCase().includes('network') || (item.errorMessage || '').toLowerCase().includes('fetch') ? '#166534' : '#991b1b'
                      }}>
                        {(item.errorMessage || '').includes('PGRST116') || (item.errorMessage || '').includes('JWT') ? 'AUTH / RLS' :
                         (item.errorMessage || '').includes('duplicate') ? 'DUPLICATE DATA' :
                         (item.errorMessage || '').toLowerCase().includes('network') || (item.errorMessage || '').toLowerCase().includes('fetch') ? 'NETWORK TIMEOUT' : 'SCHEMA MISMATCH'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
                      Failed: {new Date(item.failedAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => handleRetry(item.id)}
                      className="btn-secondary" 
                      style={{ padding: '4px 12px', minHeight: '32px', fontSize: '0.75rem', background: 'white', color: 'var(--text)' }}
                    >
                      <RefreshCw size={14} style={{ marginRight: '6px' }} /> Retry
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="btn-primary" 
                      style={{ padding: '4px 12px', minHeight: '32px', fontSize: '0.75rem', background: 'var(--danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button 
                      onClick={() => setSelectedError(selectedError === item.id ? null : item.id)}
                      className="btn-secondary" 
                      style={{ padding: '4px 12px', minHeight: '32px', fontSize: '0.75rem', background: 'transparent', border: 'none' }}
                    >
                      {selectedError === item.id ? 'Hide Details' : 'View Error'}
                    </button>
                  </div>
                </div>
                
                {selectedError === item.id && (
                  <div style={{ padding: '16px', background: 'white', borderTop: '1px solid #fee2e2' }}>
                    <p style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.85rem' }}>Error Server Response:</p>
                    <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', color: 'var(--danger)', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
                      {item.errorMessage}
                    </pre>
                    <p style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.85rem' }}>Payload Snapshot:</p>
                    <pre style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
