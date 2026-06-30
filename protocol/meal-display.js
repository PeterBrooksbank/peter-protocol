(function attachMealDisplay(global) {
  function createProtocolMealDisplayAdapter(options) {
    const copyToastId = options.copyToastId || 'copyToast';

    function buildPlanHtml(meal) {
      if (!meal.plan) return '';

      const planItems = meal.plan.items.map(item => `
          <div class="flex justify-between items-baseline py-1 border-b border-ink/12 text-[0.62rem] last:border-b-0">
            <span class="text-ink tracking-[0.02em]">${item.name}</span>
            <span>
              <span class="text-warm tracking-[0.04em] whitespace-nowrap tabular-nums">${item.amount}</span>
              ${item.kcal > 0 ? `<span class="text-stone text-[0.55rem] ml-2 tabular-nums">${item.kcal} kcal</span>` : ''}
            </span>
          </div>`).join('');

      return `
          <div class="mt-2 mb-1">
            ${planItems}
            <div class="flex justify-between pt-2 mt-2 border-t border-warm-light text-[0.65rem]">
              <span class="text-stone tracking-[0.06em] uppercase text-[0.55rem]">Meal total</span>
              <span class="text-warm tabular-nums">${meal.plan.kcal} kcal · P${meal.plan.protein}g</span>
            </div>
          </div>
          <div class="h-px bg-ink/12 my-2"></div>`;
    }

    function buildIngredientsHtml(meal) {
      if (!meal.ingredients) return '';

      return `
        <div class="grid grid-cols-2 gap-[2px_12px] mt-2 mb-1">
          ${meal.ingredients.map(item => `
            <div class="text-[0.6rem] text-stone tracking-[0.02em] leading-[1.6] flex gap-[5px] items-baseline">
              <span class="text-warm whitespace-nowrap shrink-0 text-[0.58rem] tabular-nums">${item.amount}</span>
              <span>${item.name}</span>
            </div>`).join('')}
        </div>
        <div class="h-px bg-ink/12 my-2"></div>`;
    }

    function buildCardHtml(meal, isSelected, showPlan) {
      const contentHtml = showPlan ? buildPlanHtml(meal) : buildIngredientsHtml(meal);

      return `
        <button class="meal-copy-btn absolute top-3 right-[14px] size-[26px] border border-ink/12 rounded-[3px] bg-white flex items-center justify-center cursor-pointer z-[2]" title="Copy ingredients">
          <svg viewBox="0 0 24 24" class="size-[13px] fill-none [stroke:var(--color-stone)] [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]"><rect x="9" y="9" width="12" height="12" rx="1.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
        <div class="flex items-baseline gap-2.5 mb-1 pr-[34px]">
          <div class="text-[0.78rem] tracking-[0.02em] text-ink flex-1">${meal.name}${meal.plan ? '<span class="inline-block text-[0.48rem] tracking-[0.1em] uppercase text-white bg-signal px-1.5 py-[2px] rounded-[2px] ml-1.5 align-middle font-mono not-italic">1400</span>' : ''}</div>
          <div class="text-[0.6rem] text-warm tracking-[0.06em] whitespace-nowrap shrink-0 tabular-nums">${meal.kcal} kcal</div>
        </div>
        <div class="text-[0.58rem] text-stone tracking-[0.04em] mb-1">
          <span class="mr-2.5">P ${meal.protein}g</span><span class="mr-2.5">C ${meal.carbs}g</span><span>F ${meal.fat}g</span>
        </div>
        ${contentHtml}
        <div class="text-[0.62rem] text-stone italic font-display leading-[1.5]">${meal.notes}</div>
        ${meal.tags.map(tag => `<span class="inline-block text-[0.48rem] tracking-[0.1em] uppercase font-mono not-italic px-[5px] py-px rounded-[2px] mt-[5px] mr-1 ${tag === 'quick' ? 'text-[#5a6b7a] border border-[#5a6b7a]' : 'text-moss border border-moss'}">${tag}</span>`).join('')}
      `;
    }

    function mealIngredientsText(meal, showPlan) {
      const lines = [meal.name + ':'];

      if (showPlan && meal.plan) {
        meal.plan.items.forEach(item => {
          lines.push(`- ${item.amount} ${item.name}`);
        });
      } else if (meal.ingredients) {
        meal.ingredients.forEach(item => {
          lines.push(`- ${item.amount} ${item.name}`);
        });
      }

      return lines.join('\n');
    }

    function setCopySuccessUI(meal, button) {
      button.classList.add('copied');
      button.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
      const toast = document.getElementById(copyToastId);
      if (toast) {
        toast.textContent = `Copied "${meal.name}" ingredients`;
        toast.classList.add('visible');
      }
      clearTimeout(global._copyToastTimer);
      clearTimeout(global._copyBtnTimer);
      global._copyToastTimer = setTimeout(() => {
        if (toast) toast.classList.remove('visible');
      }, 1800);
      global._copyBtnTimer = setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="1.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
      }, 1200);
    }

    function fallbackCopy(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        cb();
      } catch {
        // Ignore copy errors so the app remains responsive.
      }
      document.body.removeChild(ta);
    }

    function copyIngredients(meal, showPlan, button) {
      const text = mealIngredientsText(meal, showPlan);
      const onSuccess = () => setCopySuccessUI(meal, button);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess));
        return;
      }

      fallbackCopy(text, onSuccess);
    }

    return {
      buildCardHtml,
      copyIngredients
    };
  }

  global.createProtocolMealDisplayAdapter = createProtocolMealDisplayAdapter;
})(window);
