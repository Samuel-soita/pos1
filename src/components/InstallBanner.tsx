import { useState, useEffect } from 'react';
import { Download, X, Star } from 'lucide-react';

// Simple interface for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if standalone
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    if (mediaQuery.matches) {
      setShowBanner(false);
      return;
    }

    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Initial show for dev/visibility
    setShowBanner(true);

    const handleMediaQueryChange = (e: MediaQueryListEvent | { matches: boolean }) => {
      if (e.matches) setShowBanner(false);
    };

    mediaQuery.addEventListener('change', handleMediaQueryChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      const installEvent = e as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      mediaQuery.removeEventListener('change', handleMediaQueryChange);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      alert('To install SMUTA PAY on iOS: Tap the "Share" icon (bottom of screen) and select "Add to Home Screen".');
      handleClose();
      return;
    }

    if (!deferredPrompt) return;
    
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User install response: ${outcome}`);
    } catch (err) {
      console.error('Error during installation:', err);
    } finally {
      setDeferredPrompt(null);
      handleClose();
    }
  };

  const handleClose = () => {
    setShowBanner(false);
    // Snooze for 24 hours
    const snoozeTime = Date.now() + (24 * 60 * 60 * 1000);
    localStorage.setItem('installBannerSnoozeUntil', snoozeTime.toString());
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="install-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
        <img src="/POS1.jpg" alt="SMUTA PAY" className="install-logo" />
        <div style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>SMUTA PAY</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
            {isIOS ? 'Tap Share > "Add to Home Screen"' : 'Install for 100% offline access'} <Star size={12} fill="var(--warning)" color="var(--warning)" />
          </p>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn-primary" onClick={handleInstallClick} style={{ padding: '8px 20px', minHeight: '44px', fontSize: '1rem' }}>
          <Download size={18} /> {isIOS ? 'How to Install' : 'Install App'}
        </button>
        <button onClick={handleClose} style={{ background: 'transparent', padding: '8px', minHeight: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <X size={20} color="var(--text-muted)" />
        </button>
      </div>
    </div>
  );
}
