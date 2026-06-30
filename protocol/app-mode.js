// protocol/app-mode.js
(function attachAppMode(global) {
  function createAppMode(options = {}) {
    const onEnterFinance = options.onEnterFinance;
    let mode = 'health';
    let financeLoaded = false;

    const hidden = () => [
      document.querySelector('.nav'),
      document.querySelector('.sync-bar'),
      ...document.querySelectorAll('.tab-content'),
    ].filter(Boolean);

    function show(next) {
      mode = next;
      const fin = next === 'finance';
      hidden().forEach(el => { el.style.display = fin ? 'none' : ''; });
      const root = document.getElementById('finance-root');
      if (root) root.style.display = fin ? '' : 'none';
      document.querySelectorAll('.mode-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.mode === next));
      if (fin && onEnterFinance) { onEnterFinance(!financeLoaded); financeLoaded = true; }
    }

    return { show, get mode() { return mode; } };
  }
  global.createAppMode = createAppMode;
})(window);