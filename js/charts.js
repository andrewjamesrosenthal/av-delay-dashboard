'use strict';

// ─────────────────────────────────────────────
// CHARTS
// Chart.js wrappers + pure-CSS bar chart helpers
// ─────────────────────────────────────────────

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      labels: {
        color: '#8b949e',
        font: { family: "'Inter', system-ui, sans-serif", size: 12 },
      },
    },
    tooltip: {
      backgroundColor: '#1c2128',
      borderColor: '#30363d',
      borderWidth: 1,
      titleColor: '#e6edf3',
      bodyColor: '#8b949e',
      padding: 10,
    },
  },
  scales: {
    x: {
      ticks: { color: '#8b949e', font: { size: 11 } },
      grid:  { color: '#21262d' },
    },
    y: {
      ticks: { color: '#8b949e', font: { size: 11 } },
      grid:  { color: '#21262d' },
    },
  },
};

// Track active charts so we can destroy before re-rendering
const _activeCharts = {};

function destroyChart(id) {
  if (_activeCharts[id]) {
    _activeCharts[id].destroy();
    delete _activeCharts[id];
  }
}

// ─── Fatality trend chart for a city ───
function renderFatalityChart(canvasId, city) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;

  const years = Object.keys(city.annualFatalities).map(Number).sort();
  const values = years.map(y => city.annualFatalities[y]);

  const delayYear = new Date(city.delayStartDate).getFullYear();

  const barColors = years.map(y => {
    if (y >= delayYear) return 'rgba(248, 81, 73, 0.7)';
    return 'rgba(88, 166, 255, 0.4)';
  });

  const borderColors = years.map(y => {
    if (y >= delayYear) return '#f85149';
    return '#58a6ff';
  });

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [{
        label: 'Traffic fatalities',
        data: values,
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} fatalities`,
            afterLabel: (ctx) => {
              const yr = years[ctx.dataIndex];
              if (yr >= delayYear) return ' ← After delay start';
              return '';
            },
          },
        },
        annotation: undefined,
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          beginAtZero: true,
          title: { display: true, text: 'Annual fatalities', color: '#6e7681', font: { size: 11 } },
        },
      },
    },
  });

  _activeCharts[canvasId] = chart;
}

// ─── Time-to-launch comparison chart ───
function renderTimeToLaunchChart(canvasId) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;

  const operational = [
    { name: 'Atlanta, GA',    months: 5,   type: 'operational' },
    { name: 'Los Angeles, CA', months: 12,  type: 'operational' },
    { name: 'Austin, TX',     months: 15,  type: 'operational' },
  ];

  const blocked = [
    { name: 'Boston, MA',    months: 22,  type: 'blocked',    note: 'Testing since May 2025, no framework' },
    { name: 'Washington, DC', months: 27,  type: 'limbo',      note: 'Testing since Apr 2024, still blocked' },
    { name: 'Chicago, IL',   months: 5,   type: 'limbo',      note: 'AVs arrived, no framework (and counting)' },
    { name: 'New York City',  months: 15,  type: 'blocked',    note: 'Mapping since late 2025, no path' },
    { name: 'Seattle, WA',   months: 15,  type: 'limbo',      note: 'No commercial service yet' },
  ];

  const all = [...operational, ...blocked];

  const colors = all.map(d => {
    if (d.type === 'operational') return '#3fb950';
    if (d.type === 'blocked') return '#f85149';
    return '#d29922';
  });

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: all.map(d => d.name),
      datasets: [{
        label: 'Months from testing → commercial launch',
        data: all.map(d => d.months),
        backgroundColor: colors.map(c => c + 'aa'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const d = all[ctx.dataIndex];
              if (d.type === 'operational') return ` ${ctx.parsed.x} months to launch ✓ Operational`;
              return ` ${ctx.parsed.x}+ months  -  ${d.note}`;
            },
          },
        },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          beginAtZero: true,
          title: { display: true, text: 'Months from testing start', color: '#6e7681', font: { size: 11 } },
        },
        y: { ...CHART_DEFAULTS.scales.y },
      },
    },
  });

  _activeCharts[canvasId] = chart;
}

// ─── Safety comparison chart ───
function renderSafetyChart(canvasId) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;

  const data = [
    { label: 'Waymo', value: 0.02, color: '#3fb950', note: 'Serious injuries/million miles (police-reported)' },
    { label: 'Lyft',  value: 0.38, color: '#d29922', note: 'Accidents/million miles (self-reported)' },
    { label: 'Uber',  value: 0.45, color: '#f0883e', note: 'Accidents/million miles (self-reported)' },
  ];

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: 'Incidents per million miles',
        data: data.map(d => d.value),
        backgroundColor: data.map(d => d.color + 'aa'),
        borderColor: data.map(d => d.color),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} incidents/million miles`,
            afterLabel: (ctx) => `  ${data[ctx.dataIndex].note}`,
          },
        },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          beginAtZero: true,
          title: { display: true, text: 'Incidents per million miles', color: '#6e7681', font: { size: 11 } },
        },
      },
    },
  });

  _activeCharts[canvasId] = chart;
}

// ─── Pure-CSS horizontal bar helper ───
// Returns HTML string for a bar chart row
function barRowHTML(label, value, max, colorClass, displayValue) {
  const pct = Math.min(100, (value / max) * 100);
  return `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track">
        <div class="bar-fill ${colorClass}" style="width:${pct}%"></div>
        <span class="bar-value">${displayValue}</span>
      </div>
    </div>`;
}

// ─── National breakdown bar chart (CSS-based) ───
function renderNationalBreakdownHTML(containerEl) {
  if (!containerEl) return;

  const now = new Date();
  const cityData = CITIES.map(city => ({
    name: city.name,
    value: calculatePreventableDeaths(city, now),
    status: city.status,
  })).sort((a, b) => b.value - a.value);

  const max = cityData[0].value;

  const colorMap = { blocked: 'red', limbo: 'yellow' };
  const rows = cityData.map(d =>
    barRowHTML(d.name, d.value, max, colorMap[d.status] || 'gray', d.value.toFixed(2))
  ).join('');

  containerEl.innerHTML = `<div class="bar-chart">${rows}</div>`;
}
