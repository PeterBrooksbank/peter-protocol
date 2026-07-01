// finance/components/charts.js — hand-rolled inline SVG charts (no dependencies)

import { esc } from './ui.js';

/**
 * Render a grouped bar chart comparing two series across months.
 * @param {object} opts
 * @param {Array<{label: string, planned: number, actual: number}>} opts.data  Pence values
 * @param {number} [opts.width=560]
 * @param {number} [opts.height=200]
 * @returns {string} SVG markup
 */
export function groupedBarChart({ data, width = 560, height = 200 }) {
  if (!data.length) return '<p class="py-8 text-center font-display text-sm text-stone italic">No budget history yet.</p>';

  const padding = { top: 16, right: 12, bottom: 28, left: 12 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(1, ...data.flatMap(d => [d.planned, d.actual]));
  const groupW = chartW / data.length;
  const barW = groupW * 0.32;
  const gap = groupW * 0.06;

  const scaleY = (v) => chartH - (v / maxVal) * chartH;

  const bars = data.map((d, i) => {
    const groupX = padding.left + i * groupW;
    const plannedH = chartH - scaleY(d.planned);
    const actualH  = chartH - scaleY(d.actual);
    const overBudget = d.actual > d.planned && d.planned > 0;
    return `
      <g>
        <rect x="${groupX + gap}" y="${padding.top + scaleY(d.planned)}"
              width="${barW}" height="${plannedH}"
              fill="var(--color-warm)" opacity="0.5" rx="2"/>
        <rect x="${groupX + gap + barW + gap}" y="${padding.top + scaleY(d.actual)}"
              width="${barW}" height="${actualH}"
              fill="${overBudget ? 'var(--color-signal)' : 'var(--color-moss)'}" rx="2"/>
        <text x="${groupX + groupW / 2}" y="${height - 8}"
              text-anchor="middle" font-size="10" fill="var(--color-stone)">${esc(d.label)}</text>
      </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="h-auto w-full" role="img" aria-label="Planned vs actual by month">
      <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}"
            stroke="var(--color-stone)" stroke-opacity="0.2"/>
      ${bars}
    </svg>
    <div class="mt-2 flex justify-center gap-4 text-xs text-stone">
      <span class="flex items-center gap-1"><span class="inline-block size-2.5 rounded-sm" style="background:var(--color-warm);opacity:0.5"></span>Planned</span>
      <span class="flex items-center gap-1"><span class="inline-block size-2.5 rounded-sm" style="background:var(--color-moss)"></span>Actual</span>
    </div>`;
}

/**
 * Render a simple line chart (e.g. net worth trend).
 * @param {object} opts
 * @param {Array<{label: string, value: number}>} opts.data  Pence values
 */
export function lineChart({ data, width = 560, height = 160 }) {
  if (!data.length) return '<p class="py-8 text-center font-display text-sm text-stone italic">No trend data yet.</p>';
  const padding = { top: 12, right: 12, bottom: 24, left: 12 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const scaleX = (i) => padding.left + (i / Math.max(1, data.length - 1)) * chartW;
  const scaleY = (v) => padding.top + chartH - ((v - minVal) / range) * chartH;

  const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`).join(' ');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="h-auto w-full" role="img" aria-label="Trend over time">
      <polyline points="${points}" fill="none" stroke="var(--color-moss)" stroke-width="2"/>
      ${data.map((d, i) => `<circle cx="${scaleX(i)}" cy="${scaleY(d.value)}" r="2.5" fill="var(--color-moss)"/>`).join('')}
      ${data.map((d, i) => `<text x="${scaleX(i)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="var(--color-stone)">${esc(d.label)}</text>`).join('')}
    </svg>`;
}
