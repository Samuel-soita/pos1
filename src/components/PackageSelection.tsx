
import { useAuth } from '../hooks/useAuth';
import { LayoutGrid } from 'lucide-react';
import { CustomPlanSelector } from './CustomPlanSelector';

export function PackageSelection({ isEmbedded = false, onComplete }: { isEmbedded?: boolean, onComplete?: () => void }) {
  const { business } = useAuth();

  return (
    <div style={{ paddingBottom: isEmbedded ? '0' : '100px' }}>
      {!isEmbedded && (
        <div style={{ 
          background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #f8fafc 100%)',
          padding: '40px 20px',
          textAlign: 'center',
          borderBottom: '1px solid var(--border)',
          marginBottom: '40px'
        }}>
          <div style={{ 
            maxWidth: '360px', 
            margin: '0 auto 24px', 
            padding: '16px', 
            background: 'white', 
            borderRadius: '20px', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            border: '1px solid var(--border)' 
          }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Active Registration</p>
            <h2 style={{ fontSize: '1.50rem', fontWeight: 900, marginBottom: '4px' }}>{business?.name}</h2>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700 }}>
              <LayoutGrid size={14} color="var(--primary)" />
              Code: {business?.code}
            </div>
          </div>

          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1px', marginBottom: '12px', background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Build Your Plan
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto' }}>
            Start from scratch or pick a base plan. Try it for <strong style={{ color: 'var(--primary)' }}>5 days for free</strong>.
          </p>
        </div>
      )}

      <CustomPlanSelector onComplete={onComplete} />
    </div>
  );
}

