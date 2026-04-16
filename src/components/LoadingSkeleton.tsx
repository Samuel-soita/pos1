import { ShoppingCart } from 'lucide-react';

export function LoadingSkeleton() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '60vh', 
      gap: '24px',
      animation: 'fadeIn 0.5s ease-out'
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          borderRadius: '50%', 
          background: 'var(--bg-secondary)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          animation: 'pulse 2s infinite ease-in-out'
        }}>
          <ShoppingCart size={40} color="var(--primary)" />
        </div>
        <div style={{ 
          position: 'absolute', 
          inset: '-10px', 
          border: '2px solid var(--primary)', 
          borderRadius: '50%', 
          opacity: 0.2,
          animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
        }}></div>
      </div>
      
      <div style={{ textAlign: 'center' }}>
        <h3 className="brand-shimmer" style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '12px', letterSpacing: '-1px' }}>SMUTA PAY</h3>
        <div style={{ 
          width: '120px', 
          height: '2px', 
          background: 'var(--bg-secondary)', 
          borderRadius: '1px', 
          margin: '0 auto',
          overflow: 'hidden' 
        }}>
          <div style={{ 
            width: '40%', 
            height: '100%', 
            background: 'var(--primary)', 
            animation: 'progressMove 1.5s infinite linear'
          }}></div>
        </div>
      </div>

      <style>{`
        @keyframes progressMove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div className="skeleton-box" style={{ width: '40px', height: '40px', borderRadius: '8px' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="skeleton-box" style={{ width: '120px', height: '14px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '80px', height: '10px', borderRadius: '4px' }}></div>
              </div>
            </div>
            <div className="skeleton-box" style={{ width: '60px', height: '24px', borderRadius: '12px' }}></div>
          </div>
        ))}
      </div>
    </div>
  );
}
