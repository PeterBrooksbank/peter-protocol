(function attachChecklistLogic(global) {
  function createProtocolChecklistLogic() {
    function getAllItems(protocol) {
      return protocol.flatMap(section => section.items);
    }

    function getCheckedCount(state) {
      return Object.values(state.checked).filter(Boolean).length;
    }

    function getTotalCount(protocol) {
      return getAllItems(protocol).length;
    }

    function getProgress(state, protocol) {
      const done = getCheckedCount(state);
      const total = getTotalCount(protocol);
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { done, total, pct };
    }

    function toggleItem(state, itemId) {
      state.checked[itemId] = !state.checked[itemId];
      return state.checked[itemId];
    }

    function markDayCompleteIfNeeded(state, progress) {
      if (progress.done === progress.total && progress.total > 0 && !state.allDone) {
        state.allDone = true;
        if (!state.history.includes(state.date)) state.history.push(state.date);
        return true;
      }
      return false;
    }

    function getSectionStatuses(protocol, state) {
      return protocol.map(section => {
        const done = section.items.filter(item => state.checked[item.id]).length;
        return {
          id: section.id,
          done,
          total: section.items.length,
          allDone: done === section.items.length
        };
      });
    }

    return {
      getProgress,
      toggleItem,
      markDayCompleteIfNeeded,
      getSectionStatuses
    };
  }

  global.createProtocolChecklistLogic = createProtocolChecklistLogic;
})(window);
