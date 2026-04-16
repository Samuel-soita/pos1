import { Component, type ErrorInfo, type ReactNode } from 'react';

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
          padding: '24px',
          textAlign: 'center',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>System Reloading</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Restoring workspace state to ensure data integrity...</p>
          <button 
            onClick={this.handleReload} 
            className="btn-primary"
            style={{ width: '200px' }}
          >
            Refresh Now
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
