import { useAuth } from '../hooks/useAuth';
import { useInventory } from '../hooks/useInventory';
import { useCashControl } from '../hooks/useCashControl';
import { 
  ShoppingCart, Receipt,
  ChevronRight,
  Package, BarChart3, Users, Settings
} from 'lucide-react';

interface FeatureItem {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  badge?: string;
  badgeColor?: string;
  ownerOnly?: boolean;
}

export function Dashboard({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const { userType } = useAuth();
  const { getLowStockProducts } = useInventory();
  const { isRegisterOpen } = useCashControl();
  const lowStock = getLowStockProducts?.() || [];


  const features = [
    { 
      id: 'sales', 
      title: 'Sales', 
      desc: 'Process transactions & print receipts', 
      icon: <ShoppingCart size={28} />, 
      gradient: 'card-gradient-primary',
      badge: isRegisterOpen ? 'Live' : 'Closed',
      badgeColor: isRegisterOpen ? 'var(--success)' : 'var(--danger)'
    },
    { 
      id: 'inventory', 
      title: 'Stocks', 
      desc: 'Inventory & stock management', 
      icon: <Package size={28} />, 
      gradient: 'card-gradient-amber',
      badge: lowStock.length > 0 ? `${lowStock.length} Alerts` : 'Optimal',
      badgeColor: lowStock.length > 0 ? 'var(--danger)' : 'var(--success)'
    },
    { 
      id: 'reports', 
      title: 'Reports', 
      desc: 'Sales performance & profit metrics', 
      icon: <BarChart3 size={28} />, 
      gradient: 'card-gradient-success',
      ownerOnly: true 
    },
    { 
      id: 'staff', 
      title: 'Team', 
      desc: 'Staff roles, PINs & permissions', 
      icon: <Users size={28} />, 
      gradient: 'card-gradient-slate',
      ownerOnly: true 
    },
    { 
      id: 'expenses', 
      title: 'Expenses', 
      desc: 'Track business spending & utilities', 
      icon: <Receipt size={28} />, 
      gradient: 'card-gradient-rose' 
    },
    { 
      id: 'settings', 
      title: 'Settings', 
      desc: 'Business profile & POS config', 
      icon: <Settings size={28} />, 
      gradient: 'card-gradient-slate',
      ownerOnly: true 
    }
,
  ];

  const handleFeatureClick = (item: FeatureItem) => {
    onTabChange(item.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px', paddingTop: '20px' }}>
      {/* THE MASTER HUB (The Feature Grid Only) */}
      <section>
        <div className="hub-grid">
          {features.map((item) => {
            if (item.ownerOnly && userType !== 'owner') return null;
            
            return (
                <div 
                  key={item.id} 
                  className={`hub-card ${item.gradient}`}
                  onClick={() => handleFeatureClick(item)}
                >
                  <div className="hub-card-icon">
                    <div style={{ color: 'var(--text)' }}>{item.icon}</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 className="hub-card-title">{item.title}</h4>
                      {item.badge && (
                        <span style={{ 
                          fontSize: '0.65rem', 
                          fontWeight: 900, 
                          background: 'rgba(255,255,255,0.2)', 
                          padding: '4px 8px', 
                          borderRadius: '6px',
                          textTransform: 'uppercase'
                        }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="hub-card-desc">{item.desc}</p>
                  </div>
                  <div style={{ marginTop: 'auto', alignSelf: 'flex-end', opacity: 0.6 }}>
                    <ChevronRight size={20} />
                  </div>
                </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
