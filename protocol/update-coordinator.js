(function attachUpdateCoordinator(global) {
  function createProtocolUpdateCoordinator(options) {
    const hasPendingSync = options.hasPendingSync;
    const onPendingSyncChange = options.onPendingSyncChange || (() => () => {});
    const promptUpdate = options.promptUpdate;
    const showToast = options.showToast;
    let releasePendingSyncSubscription = null;
    let waitingWorker = null;

    function deferUntilSynced(worker) {
      if (!hasPendingSync()) {
        promptUpdate(worker);
        return;
      }

      if (showToast) {
        showToast('Update downloaded — waiting for sync');
      }

      waitingWorker = worker;
      if (releasePendingSyncSubscription) return;

      releasePendingSyncSubscription = onPendingSyncChange(isPending => {
        if (!isPending && waitingWorker) {
          const nextWorker = waitingWorker;
          waitingWorker = null;
          promptUpdate(nextWorker);
        }
      });
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
