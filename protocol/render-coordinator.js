(function attachRenderCoordinator(global) {
  function createProtocolRenderCoordinator(options) {
    const renderDate = options.renderDate;
    const renderSections = options.renderSections;
    const updateProgress = options.updateProgress;
    const renderMeals = options.renderMeals;

    function onProtocolStateChange() {
      renderDate();
      renderSections();
      updateProgress();
    }

    function onMealStateChange() {
      renderMeals();
    }

    function onInit() {
      onMealStateChange();
      onProtocolStateChange();
    }

    return {
      onInit,
      onProtocolStateChange,
      onMealStateChange
    };
  }

  global.createProtocolRenderCoordinator = createProtocolRenderCoordinator;
})(window);
