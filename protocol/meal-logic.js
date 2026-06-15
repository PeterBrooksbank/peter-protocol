(function attachMealLogic(global) {
  function createProtocolMealLogic(options) {
    const meals = options.meals;
    const macroPlan = options.macroPlan;

    function isDeficit(planMode) {
      return planMode === 'deficit';
    }

    function isMacro(planMode) {
      return planMode === 'macro';
    }

    function showPlan(planMode) {
      return isDeficit(planMode) || isMacro(planMode);
    }

    function mealFitsMacro(meal, target) {
      if (!meal.plan) return false;
      if (meal.kcal > target.kcal + 10) return false;
      if (meal.protein < target.protein * 0.85) return false;
      if (meal.fat > target.fat * 1.25) return false;
      if (meal.carbs > target.carbs * 1.25) return false;
      return true;
    }

    function getHeaderText(planMode) {
      if (isDeficit(planMode)) {
        return {
          note: 'Showing exact portions for 1400 kcal — 150 kcal milk included. Portions are per meal targets.',
          sub: '1400 kcal plan · High protein · Exact portions shown'
        };
      }

      if (isMacro(planMode)) {
        const d = macroPlan.daily;
        return {
          note: `Daily target: ${d.kcal} kcal · P${d.protein} F${d.fat} C${d.carbs} (incl. 150 kcal milk). Only meals fitting each meal's share of this target are shown.`,
          sub: `Macro plan · P${d.protein} F${d.fat} C${d.carbs} · Filtered to fit`
        };
      }

      return {
        note: '',
        sub: '~1800–2000 kcal · High protein · Select one per meal'
      };
    }

    function getSectionMeta(type, defaultMeta, planMode) {
      if (isDeficit(planMode)) {
        const targetKcal = type === 'breakfast' ? 320 : type === 'lunch' ? 380 : 550;
        return targetKcal + ' kcal target';
      }

      if (isMacro(planMode)) {
        const t = macroPlan.targets[type];
        return `${t.kcal} kcal · P${t.protein} F${t.fat} C${t.carbs}`;
      }

      return defaultMeta;
    }

    function getOptions(type, sectionOptions, planMode) {
      if (!isMacro(planMode)) return sectionOptions;
      const target = macroPlan.targets[type];
      return sectionOptions.filter(meal => mealFitsMacro(meal, target));
    }

    function findMeal(type, id) {
      return meals[type].options.find(m => m.id === id) || null;
    }

    function getDayTotals(selected, planMode) {
      const entries = Object.entries(selected);
      if (entries.length === 0) return null;

      const usePlan = showPlan(planMode);
      let totalKcal = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      const rows = [];

      entries.forEach(([type, id]) => {
        const meal = findMeal(type, id);
        if (!meal) return;
        const kcal = usePlan && meal.plan ? meal.plan.kcal : meal.kcal;
        const protein = usePlan && meal.plan ? meal.plan.protein : meal.protein;

        totalKcal += kcal;
        totalProtein += protein;
        totalCarbs += meal.carbs;
        totalFat += meal.fat;

        rows.push({
          label: meals[type].label,
          kcal,
          protein
        });
      });

      let macroComparison = null;
      if (isMacro(planMode)) {
        const daily = macroPlan.daily;
        const withMilk = {
          kcal: totalKcal + 150,
          protein: totalProtein + 8,
          fat: totalFat + 8,
          carbs: totalCarbs + 11
        };

        macroComparison = {
          target: daily,
          remaining: {
            kcal: daily.kcal - withMilk.kcal,
            protein: daily.protein - withMilk.protein,
            fat: daily.fat - withMilk.fat,
            carbs: daily.carbs - withMilk.carbs
          }
        };
      }

      return {
        count: entries.length,
        showPlan: usePlan,
        rows,
        totals: {
          kcal: totalKcal,
          protein: totalProtein,
          carbs: totalCarbs,
          fat: totalFat
        },
        macroComparison
      };
    }

    return {
      showPlan,
      getHeaderText,
      getSectionMeta,
      getOptions,
      getDayTotals
    };
  }

  global.createProtocolMealLogic = createProtocolMealLogic;
})(window);
