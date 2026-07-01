(function attachMealDisplay(global) {
  function createProtocolMealDisplayAdapter(options) {
    const copyToastId = options.copyToastId || 'copyToast';

    function buildPlanHtml(meal) {
      if (!meal.plan) return '';

      const planItems = meal.plan.items.map(item => `
          <div class="flex items-baseline justify-between border-b border-ink/12 py-1 text-sm last:border-b-0">
            <span class="tracking-[0.02em] text-ink">${item.name}</span>
            <span>
              <span class="tracking-[0.04em] whitespace-nowrap text-warm tabular-nums">${item.amount}</span>
              ${item.kcal > 0 ? `<span class="ml-2 text-sm text-stone tabular-nums">${item.kcal} kcal</span>` : ''}
            </span>
          </div>`).join('');

      return `
          <div class="mt-2 mb-1">
            ${planItems}
            <div class="mt-2 flex justify-between border-t border-warm-light pt-2 text-sm">
              <span class="text-sm tracking-[0.06em] text-stone uppercase">Meal total</span>
              <span class="text-warm tabular-nums">${meal.plan.kcal} kcal · P${meal.plan.protein}g</span>
            </div>
          </div>
          <div class="my-2 h-px bg-ink/12"></div>`;
    }

    function buildIngredientsHtml(meal) {
      if (!meal.ingredients) return '';

      return `
        <div class="mt-2 mb-1 grid grid-cols-2 gap-[2px_12px]">
          ${meal.ingredients.map(item => `
            <div class="flex items-baseline gap-[5px] text-base leading-relaxed tracking-[0.02em] text-stone">
              <span class="shrink-0 text-sm whitespace-nowrap text-warm tabular-nums">${item.amount}</span>
              <span>${item.name}</span>
            </div>`).join('')}
        </div>
        <div class="my-2 h-px bg-ink/12"></div>`;
    }

    function buildCardHtml(meal, isSelected, showPlan) {
      const contentHtml = showPlan ? buildPlanHtml(meal) : buildIngredientsHtml(meal);

      return `
        <button type="button" class="meal-copy-btn absolute top-3 right-[14px] z-2 flex size-[26px] cursor-pointer items-center justify-center rounded-[3px] border border-ink/12 bg-white" title="Copy ingredients">
          <svg viewBox="0 0 24 24" class="size-[13px] fill-none stroke-stone stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"><rect x="9" y="9" width="12" height="12" rx="1.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
        <div class="mb-1 flex items-baseline gap-2.5 pr-[34px]">
          <div class="flex-1 text-base tracking-[0.01em] text-ink">${meal.name}${meal.plan ? '<span class="ml-1.5 inline-block rounded-[2px] bg-signal px-1.5 py-[2px] align-middle font-mono text-xs tracking-widest text-white uppercase not-italic">1400</span>' : ''}</div>
          <div class="shrink-0 text-sm tracking-[0.06em] whitespace-nowrap text-warm tabular-nums">${meal.kcal} kcal</div>
        </div>
        <div class="mb-1 text-sm tracking-[0.04em] text-stone">
          <span class="mr-2.5">P ${meal.protein}g</span><span class="mr-2.5">C ${meal.carbs}g</span><span>F ${meal.fat}g</span>
        </div>
        ${contentHtml}
        <div class="font-display text-base leading-relaxed text-stone italic">${meal.notes}</div>
        ${meal.tags.map(tag => `<span class="mt-[5px] mr-1 inline-block rounded-[2px] px-[5px] py-px font-mono text-xs tracking-widest uppercase not-italic ${tag === 'quick' ? 'text-[#5a6b7a] border border-[#5a6b7a]' : 'text-moss border border-moss'}">${tag}</span>`).join('')}
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
