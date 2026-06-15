(function attachMealState(global) {
  function createProtocolMealStateManager(options) {
    const stateKey = options.stateKey || 'protocol-meals-v1';
    const modeKey = options.modeKey || 'protocol-plan-mode';
    const todayProvider = options.todayProvider || (() => new Date().toDateString());

    function createEmptyState() {
      return { date: todayProvider(), selected: {} };
    }

    function loadState() {
      const saved = localStorage.getItem(stateKey);
      if (!saved) return createEmptyState();

      try {
        const parsed = JSON.parse(saved);
        if (parsed.date === todayProvider()) return parsed;
      } catch {
        // Ignore invalid state and return a clean state.
      }
      return createEmptyState();
    }

    function saveState(state) {
      localStorage.setItem(stateKey, JSON.stringify(state));
    }

    function toggleSelection(state, mealType, mealId) {
      const next = {
        date: state.date,
        selected: { ...state.selected }
      };

      if (next.selected[mealType] === mealId) {
        delete next.selected[mealType];
      } else {
        next.selected[mealType] = mealId;
      }

      saveState(next);
      return next;
    }

    function resetSelections(state) {
      const next = {
        date: state.date,
        selected: {}
      };
      saveState(next);
      return next;
    }

    function loadMode() {
      return localStorage.getItem(modeKey) || 'standard';
    }

    function setMode(mode) {
      localStorage.setItem(modeKey, mode);
      return mode;
    }

    return {
      loadState,
      saveState,
      toggleSelection,
      resetSelections,
      loadMode,
      setMode
    };
  }

  global.createProtocolMealStateManager = createProtocolMealStateManager;
})(window);
