(function attachUpdateCoordinator(global) {
  function createProtocolUpdateCoordinator(options) {
    const hasPendingSync = options.hasPendingSync;
    const promptUpdate = options.promptUpdate;
    const showToast = options.showToast;

    function deferUntilSynced(worker) {
      if (!hasPendingSync()) {
        promptUpdate(worker);
        return;
      }

      if (showToast) {
        showToast('Update downloaded — waiting for sync');
      }

      const timer = setInterval(() => {
        if (!hasPendingSync()) {
          clearInterval(timer);
          promptUpdate(worker);
        }
      }, 1000);
    }

    function register() {
      if (!('serviceWorker' in navigator)) return;

      window.addEventListener('load', async () => {
        try {
          const reg = await navigator.serviceWorker.register('sw.js');
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                deferUntilSynced(newWorker);
              }
            });
          });
        } catch {
          // Ignore registration errors and keep app usable.
        }
      });
    }

    return {
      register
    };
  }

  global.createProtocolUpdateCoordinator = createProtocolUpdateCoordinator;
})(window);
