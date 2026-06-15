(function attachDeviceIdentity(global) {
  function createProtocolDeviceIdentity(options) {
    const storageKey = options.storageKey || 'protocol-device-id';

    function generate() {
      return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function get() {
      return localStorage.getItem(storageKey);
    }

    function getOrCreate() {
      let id = get();
      if (!id) {
        id = generate();
        localStorage.setItem(storageKey, id);
      }
      return id;
    }

    function reset() {
      localStorage.removeItem(storageKey);
    }

    return {
      get,
      getOrCreate,
      reset
    };
  }

  global.createProtocolDeviceIdentity = createProtocolDeviceIdentity;
})(window);
