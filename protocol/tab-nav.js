(function attachTabNavigation(global) {
  function createProtocolTabNavigation(options) {
    const tabSelector = options.tabSelector || '.tab-content';
    const navSelector = options.navSelector || '.nav-tab';
    const tabPrefix = options.tabPrefix || 'tab-';

    function show(name) {
      document.querySelectorAll(tabSelector).forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll(navSelector).forEach(tab => tab.classList.remove('active'));

      const panel = document.getElementById(tabPrefix + name);
      if (panel) panel.classList.add('active');

      const nav = document.querySelector(`${navSelector}[data-tab="${name}"]`);
      if (nav) nav.classList.add('active');
    }

    return { show };
  }

  global.createProtocolTabNavigation = createProtocolTabNavigation;
})(window);
