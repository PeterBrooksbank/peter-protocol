(function attachMealDisplay(global) {
  function createProtocolMealDisplayAdapter(options) {
    const copyToastId = options.copyToastId || 'copyToast';

    function buildPlanHtml(meal) {
      if (!meal.plan) return '';

      const planItems = meal.plan.items.map(item => `
          <div class="meal-plan-row">
            <span class="meal-plan-item">${item.name}</span>
            <span>
              <span class="meal-plan-amount">${item.amount}</span>
              ${item.kcal > 0 ? `<span class="meal-plan-kcal">${item.kcal} kcal</span>` : ''}
            </span>
          </div>`).join('');

      return `
          <div class="meal-plan-amounts">
            ${planItems}
            <div class="meal-plan-total">
              <span class="meal-plan-total-label">Meal total</span>
              <span class="meal-plan-total-value">${meal.plan.kcal} kcal · P${meal.plan.protein}g</span>
            </div>
          </div>
          <div class="meal-divider"></div>`;
    }

    function buildIngredientsHtml(meal) {
      if (!meal.ingredients) return '';

      return `
        <div class="meal-ingredients">
          ${meal.ingredients.map(item => `
            <div class="meal-ingredient">
              <span class="meal-ingredient-amount">${item.amount}</span>
              <span class="meal-ingredient-name">${item.name}</span>
            </div>`).join('')}
        </div>
        <div class="meal-divider"></div>`;
    }

    function buildCardHtml(meal, isSelected, showPlan) {
      const contentHtml = showPlan ? buildPlanHtml(meal) : buildIngredientsHtml(meal);

      return `
        <button class="meal-copy-btn" title="Copy ingredients">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="1.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
        <div class="meal-card-top">
          <div class="meal-name">${meal.name}${meal.plan ? '<span class="plan-badge">1400</span>' : ''}</div>
          <div class="meal-kcal">${meal.kcal} kcal</div>
        </div>
        <div class="meal-macros">
          <span>P ${meal.protein}g</span>
          <span>C ${meal.carbs}g</span>
          <span>F ${meal.fat}g</span>
        </div>
        ${contentHtml}
        <div class="meal-notes">${meal.notes}</div>
        ${meal.tags.map(tag => `<span class="meal-tag ${tag}">${tag}</span>`).join('')}
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
