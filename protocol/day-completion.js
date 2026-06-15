(function attachDayCompletion(global) {
  function createProtocolDayCompletionOrchestrator(options) {
    const checklistLogic = options.checklistLogic;
    const schedulePush = options.schedulePush;
    const showDayComplete = options.showDayComplete;

    function computeStreak(state, todayDate) {
      const check = new Date(todayDate);
      let streak = 0;

      if (!state.allDone) {
        check.setDate(check.getDate() - 1);
      }

      while (state.history.includes(check.toDateString())) {
        streak++;
        check.setDate(check.getDate() - 1);
      }

      if (state.allDone) streak = Math.max(1, streak);
      return streak;
    }

    function buildStatsHtml(total, streak) {
      return `<strong>${total}</strong> items complete<br><strong>${streak}</strong> day streak`;
    }

    function handleProgress(state, progress) {
      if (checklistLogic.markDayCompleteIfNeeded(state, progress)) {
        schedulePush();
        setTimeout(showDayComplete, 400);
        return true;
      }
      return false;
    }

    return {
      computeStreak,
      buildStatsHtml,
      handleProgress
    };
  }

  global.createProtocolDayCompletionOrchestrator = createProtocolDayCompletionOrchestrator;
})(window);
