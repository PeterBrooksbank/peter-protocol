(function attachStateManager(global) {
  const STORAGE_KEY = 'protocol-state-v2';

  function defaultState(today) {
    return { date: today, checked: {}, history: [], allDone: false };
  }

  function createProtocolStateManager(options) {
    const workerUrl = options.workerUrl;
    const deviceId = options.deviceId;
    const today = options.today;
    const setSyncStatus = options.setSyncStatus;

    let pushTimer = null;

    function migrateState(data) {
      if (!data) return defaultState(today);

      if (data.date !== today) {
        const history = data.history || [];
        if (data.allDone && !history.includes(data.date)) history.push(data.date);
        return { date: today, checked: {}, history, allDone: false };
      }

      return {
        date: data.date || today,
        checked: data.checked || {},
        history: data.history || [],
        allDone: data.allDone || false
      };
    }

    function saveLocal(state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function loadLocal() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return defaultState(today);

      try {
        const parsed = JSON.parse(saved);
        return migrateState(parsed);
      } catch {
        return defaultState(today);
      }
    }

    function isWorkerConfigured() {
      return workerUrl && workerUrl !== 'YOUR_WORKER_URL_HERE';
    }

    async function load() {
      if (!isWorkerConfigured()) {
        const localState = loadLocal();
        setSyncStatus('', 'Local only — deploy Worker to enable sync');
        return localState;
      }

      setSyncStatus('syncing', 'Syncing...');
      try {
        const res = await fetch(`${workerUrl}/state?id=${deviceId}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) throw new Error('Server error');

        const data = await res.json();
        const nextState = migrateState(data);
        saveLocal(nextState);
        setSyncStatus('synced', 'Synced');
        return nextState;
      } catch {
        const localState = loadLocal();
        setSyncStatus('error', 'Offline — changes saved locally');
        return localState;
      }
    }

    async function push(state) {
      if (!isWorkerConfigured()) return;

      try {
        await fetch(`${workerUrl}/state?id=${deviceId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
          signal: AbortSignal.timeout(5000)
        });
        setSyncStatus('synced', 'Synced');
      } catch {
        setSyncStatus('error', 'Offline — will sync when reconnected');
      }
    }

    function schedulePush(state, delayMs) {
      saveLocal(state);
      clearTimeout(pushTimer);
      setSyncStatus('syncing', 'Saving...');
      pushTimer = setTimeout(() => {
        push(state);
      }, delayMs);
    }

    return {
      load,
      schedulePush,
      push,
      saveLocal,
      migrateState
    };
  }

  global.createProtocolStateManager = createProtocolStateManager;
})(window);
