import { useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function usePWAUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Check for updates every 10 minutes
        setInterval(() => {
          r.update();
        }, 10 * 60 * 1000);
      }
    },
  });

  const update = useCallback(() => {
    updateServiceWorker(true);
  }, [updateServiceWorker]);

  return {
    isUpdateAvailable: needRefresh,
    update,
    setNeedRefresh
  };
}
