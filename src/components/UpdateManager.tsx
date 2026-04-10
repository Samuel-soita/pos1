import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Download, Sparkles } from 'lucide-react';

export function UpdateManager() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Check for updates every 10 minutes
      if (r) {
        setInterval(() => {
          r.update();
        }, 10 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="update-toast-container">
      {needRefresh ? (
        <div className="update-toast">
          <div className="update-toast-content">
            <div className="update-toast-icon">
              <Sparkles size={20} color="var(--primary)" />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>New Features Ready!</h4>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                An update is available with improvements.
              </p>
            </div>
          </div>
          <div className="update-toast-actions">
            <button onClick={handleUpdate} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
              <RefreshCw size={14} style={{ marginRight: '4px' }} /> Update Now
            </button>
            <button onClick={close} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
              Later
            </button>
          </div>
        </div>
      ) : (
        offlineReady && (
          <div className="update-toast">
            <div className="update-toast-content">
              <div className="update-toast-icon">
                <Download size={20} color="var(--success)" />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Offline Ready</h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  App is ready to work 100% offline.
                </p>
              </div>
            </div>
            <button onClick={close} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
              Got it
            </button>
          </div>
        )
      )}
    </div>
  );
}
