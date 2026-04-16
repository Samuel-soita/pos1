import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconBg: string; // e.g. '#fee2e2'
  iconColor: string; // e.g. 'var(--danger)'
  onClick?: () => void;
  isActive?: boolean;
}

export function StatsCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  iconBg, 
  iconColor, 
  onClick, 
  isActive 
}: StatsCardProps) {
  return (
    <div 
      className="card" 
      onClick={onClick}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '20px', 
        cursor: onClick ? 'pointer' : 'default',
        border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
        transition: 'transform 0.2s',
      }}
    >
      <div style={{ 
        background: iconBg, 
        padding: '16px', 
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Icon size={32} color={iconColor} />
      </div>
      <div>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>{title}</p>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{value}</h2>
        {subtitle && (
          <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '4px' }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
