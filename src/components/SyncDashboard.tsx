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

  // Queries for the New Event-Sourced Sync Queue
  const pendingCount = useLiveQuery(() => db.pos_events.where('sync_status').equals('pending').count()) || 0;
  
  // Queries for Rejected Events (Modern DLQ)
  const rejectedEvents = useLiveQuery(() => db.pos_events.where('sync_status').equals('rejected_dlq').toArray()) || [];
  
  const handleRetry = async (eventId: string) => {
    // Reset status to pending to trigger a retry in the next sync loop
    await db.pos_events.update(eventId, { 
      sync_status: 'pending',
      retry_count: 0,
      last_error: undefined
    });
    
    if (isOnline) {
      syncAll();
    }
  };

  const handleDelete = async (eventId: string) => {
    if (confirm('Are you sure you want to permanently delete this failed event? This cannot be undone and may cause data inconsistency.')) {
      await db.pos_events.delete(eventId);
    }
  };

  const handleRetryAll = async () => {
    const ids = rejectedEvents.map(e => e.event_id);
    await db.pos_events.where('event_id').anyOf(ids).modify({
      sync_status: 'pending',
      retry_count: 0,
      last_error: undefined
    });
    
    if (isOnline) {
      syncAll();
    }
  };

  return (
    <div className="card" style={{ padding: 'min(24px, 5vw)', border: '2px solid var(--border)' }}>
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ServerCrash size={24} color={rejectedEvents.length > 0 ? "var(--danger)" : "var(--primary)"} />
            Cloud Sync Health
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Monitor background backups and resolve sync failures.</p>
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

        <div style={{ background: rejectedEvents.length > 0 ? '#fef2f2' : '#f0fdf4', padding: '20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px', border: rejectedEvents.length > 0 ? '1px dashed var(--danger)' : '1px solid #dcfce7' }}>
          <div style={{ background: rejectedEvents.length > 0 ? '#fee2e2' : '#dcfce7', padding: '12px', borderRadius: '50%' }}>
            {rejectedEvents.length > 0 ? <AlertCircle size={24} color="#dc2626" /> : <CheckCircle2 size={24} color="#166534" />}
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: rejectedEvents.length > 0 ? '#b91c1c' : '#166534' }}>Stuck Events</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: rejectedEvents.length > 0 ? '#991b1b' : '#14532d' }}>{rejectedEvents.length}</h3>
          </div>
        </div>
      </div>

      {rejectedEvents.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)' }}>Failed Events Require Attention</h3>
            <button className="btn-primary" onClick={handleRetryAll} style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
              Retry All
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rejectedEvents.map(item => (
              <div key={item.event_id} style={{ border: '1px solid #fee2e2', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ background: '#fef2f2', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, color: '#991b1b' }}>
                        Type: {item.event_type}
                      </span>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        fontWeight: 700,
                        background: '#fecaca',
                        color: '#991b1b'
                      }}>
                        SERVER REJECTION
                      </span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
                      ID: {item.event_id.substring(0, 8)}...
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => handleRetry(item.event_id)}
                      className="btn-secondary" 
                      style={{ padding: '4px 12px', minHeight: '32px', fontSize: '0.75rem', background: 'white', color: 'var(--text)' }}
                    >
                      <RefreshCw size={14} style={{ marginRight: '6px' }} /> Retry
                    </button>
                    <button 
                      onClick={() => handleDelete(item.event_id)}
                      className="btn-primary" 
                      style={{ padding: '4px 12px', minHeight: '32px', fontSize: '0.75rem', background: 'var(--danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button 
                      onClick={() => setSelectedError(selectedError === item.event_id ? null : item.event_id)}
                      className="btn-secondary" 
                      style={{ padding: '4px 12px', minHeight: '32px', fontSize: '0.75rem', background: 'transparent', border: 'none' }}
                    >
                      {selectedError === item.event_id ? 'Hide Details' : 'View Error'}
                    </button>
                  </div>
                </div>
                
                {selectedError === item.event_id && (
                  <div style={{ padding: '16px', background: 'white', borderTop: '1px solid #fee2e2' }}>
                    <p style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.85rem' }}>Error Server Response:</p>
                    <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', color: 'var(--danger)', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
                      {item.last_error || 'No error message captured.'}
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

