import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          height: '100vh', 
          width: '100vw', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: '#f8fafc',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{ maxWidth: '400px' }}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              background: 'rgba(239, 68, 68, 0.1)', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 24px'
            }}>
              <AlertTriangle size={32} color="#ef4444" />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '12px', color: '#0f172a' }}>
              Interface Refresh Needed
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '32px' }}>
              The application encountered a small technical glitch. Don't worry, your data is safe in the local ledger. Please refresh to continue.
            </p>
            <button 
              onClick={this.handleReload}
              style={{ 
                width: '100%', 
                height: '56px', 
                background: 'var(--primary)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '28px',
                fontWeight: 700,
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                cursor: 'pointer',
                boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)'
              }}
            >
              <RefreshCw size={20} />
              Reload SMUTA PAY
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
