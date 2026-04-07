import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ShoppingCart } from 'lucide-react';

export function AuthScreen() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
        // Supabase might require email verification, but we'll assume it doesn't for the MVP by default
        // If it does, they'll check their email. We'll show a quick success message.
        setError('Check your email if confirmation is required or simply login!');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)' }}>
      <div style={{ margin: 'auto', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <ShoppingCart size={48} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>POS MVP</h1>
          <p style={{ color: 'var(--text-muted)' }}>Sign in to manage your storefront.</p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{ padding: '12px', background: 'var(--danger)', color: 'white', borderRadius: '8px', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}
            
            <div>
              <label>Email Address</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            
            <div>
              <label>Password</label>
              <input required type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {isLogin ? "Don't have a business account? " : "Already have an account? "}
            </span>
            <button 
              type="button" 
              onClick={() => { setIsLogin(!isLogin); setError(''); }} 
              style={{ background: 'transparent', padding: 0, color: 'var(--primary)', textDecoration: 'underline' }}
            >
              {isLogin ? 'Register' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
