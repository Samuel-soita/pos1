import { useAuth } from '../hooks/useAuth';
import { useInventory } from '../hooks/useInventory';
import { useCashControl } from '../hooks/useCashControl';
import { 
  ShoppingCart, Receipt, Truck,
  Package, BarChart3, Users, Settings, Lock
} from 'lucide-react';
import { useLayout } from './Layout';

interface FeatureItem {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  badge?: string;
  badgeColor?: string;
}

export function Dashboard({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const { userType, business, staff } = useAuth();
  const { getLowStockProducts } = useInventory();
  const { isRegisterOpen } = useCashControl();
  const { requestAuth } = useLayout();
  const lowStock = getLowStockProducts?.() || [];

  const displayName = userType === 'staff' ? staff?.firstName : business?.name;

  const features: FeatureItem[] = [
    { 
      id: 'sales', 
      title: 'Sales', 
      desc: 'Process transactions & print receipts', 
      icon: <ShoppingCart size={28} />, 
      gradient: 'card-gradient-primary',
      badge: isRegisterOpen ? 'Live' : undefined,
      badgeColor: isRegisterOpen ? 'var(--success)' : 'var(--danger)'
    },
    { 
      id: 'inventory', 
      title: 'Stocks', 
      desc: 'Inventory & stock management', 
      icon: <Package size={28} />, 
      gradient: 'card-gradient-amber',
      badge: lowStock.length > 0 ? `${lowStock.length} Alerts` : undefined,
      badgeColor: lowStock.length > 0 ? 'var(--danger)' : 'var(--success)'
    },
    { 
      id: 'purchases', 
      title: 'Purchases', 
      desc: 'Buy and restock items', 
      icon: <ShoppingCart size={28} />, 
      gradient: 'card-gradient-success'
    },
    { 
      id: 'suppliers', 
      title: 'Suppliers', 
      desc: 'Manage your contacts', 
      icon: <Truck size={28} />, 
      gradient: 'card-gradient-rose'
    },
    { 
      id: 'reports', 
      title: 'Sales & Profit', 
      desc: 'Total Money In & Out', 
      icon: <BarChart3 size={28} />, 
      gradient: 'card-gradient-success'
    },
    { 
      id: 'staff', 
      title: 'Staff Management', 
      desc: 'Staff roles, PINs & shifts', 
      icon: <Users size={28} />, 
      gradient: 'card-gradient-slate'
    },
    { 
      id: 'expenses', 
      title: 'Expenses', 
      desc: 'Track shop spending', 
      icon: <Receipt size={28} />, 
      gradient: 'card-gradient-rose' 
    },
    { 
      id: 'settings', 
      title: 'Settings', 
      desc: 'Business profile & POS config', 
      icon: <Settings size={28} />, 
      gradient: 'card-gradient-slate'
    }
  ];

  const handleFeatureClick = (item: FeatureItem) => {
    // Dynamic Permission Check:
    // If user is staff, check if the business has explicitly disabled this tab.
    const permissionKey = ['purchases', 'suppliers'].includes(item.id) ? 'procurement' : item.id;
    const isRestricted = userType === 'staff' && business?.staffPermissions?.[permissionKey] === false;

    if (isRestricted) {
      requestAuth(() => onTabChange(item.id));
    } else {
      onTabChange(item.id);
    }
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
            const permissionKey = ['purchases', 'suppliers'].includes(item.id) ? 'procurement' : item.id;
            const isLocked = userType === 'staff' && business?.staffPermissions?.[permissionKey] === false;
            
            return (
                <div 
                  key={item.id} 
                  className="hub-card-wrapper"
                  onClick={() => handleFeatureClick(item)}
                  title={isLocked ? 'Restricted: Owner Access Required' : item.desc}
                  style={{ opacity: isLocked ? 0.7 : 1 }}
                >
                  <div className="hub-card" style={{ 
                    background: isLocked ? 'var(--secondary)' : undefined,
                    filter: isLocked ? 'grayscale(0.5)' : 'none'
                  }}>
                    <div className="hub-card-icon">
                      <div>{item.icon}</div>
                    </div>
                    {isLocked && (
                      <div style={{ position: 'absolute', bottom: '-5px', right: '-5px', background: 'var(--danger)', color: 'white', padding: '6px', borderRadius: '50%', display: 'flex', border: '2px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                        <Lock size={12} fill="currentColor" />
                      </div>
                    )}
                    {item.badge && !isLocked && (
                      <span className="hub-card-badge">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h4 className="hub-card-title" style={{ color: isLocked ? 'var(--secondary)' : 'var(--text)' }}>
                    {item.title}
                  </h4>
                </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
