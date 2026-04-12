import { useAuth } from '../hooks/useAuth';
import { useInventory } from '../hooks/useInventory';
import { useCashControl } from '../hooks/useCashControl';
import { 
  ShoppingCart, Receipt,
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
  const { userType, business, staff } = useAuth();
  const { getLowStockProducts } = useInventory();
  const { isRegisterOpen } = useCashControl();
  const lowStock = getLowStockProducts?.() || [];

  const displayName = userType === 'staff' ? staff?.firstName : business?.name;


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
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '80px' }}>
      <header className="welcome-section welcome-greeting">
        <h1 className="welcome-title">Hello, {displayName || 'Partner'}</h1>
        <p className="welcome-subtitle">What would you like to manage today?</p>
      </header>

      {/* THE MASTER HUB (The Feature Grid Only) */}
      <section style={{ padding: '0 20px', width: '100%' }}>
        <div className="hub-grid">
          {features.map((item) => {
            if (item.ownerOnly && userType !== 'owner') return null;
            
            return (
                <div 
                  key={item.id} 
                  className="hub-card-wrapper"
                  onClick={() => handleFeatureClick(item)}
                  title={item.desc}
                >
                  <div className="hub-card">
                    <div className="hub-card-icon">
                      <div>{item.icon}</div>
                    </div>
                    {item.badge && (
                      <span className="hub-card-badge">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h4 className="hub-card-title">{item.title}</h4>
                </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
