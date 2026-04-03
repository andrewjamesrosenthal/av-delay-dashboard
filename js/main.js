'use strict';

// ─────────────────────────────────────────────
// AV DELAY DASHBOARD  -  MAIN APP
// ─────────────────────────────────────────────

// ─── State ───
let activeCityId = null;
let activeTabId = 'delay';
let counters = []; // { el, startValue, rate, startTimestamp }
let rafId = null;

// ─── DOM refs ───
const $ = id => document.getElementById(id);

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  renderCityCards();
  renderOperationalCities();
  renderStatusTable();
  renderNationalBreakdown();
  startCounters();
  initScrollCTA();
  initHeaderNav();
});

// ─────────────────────────────────────────────
// CITY CARDS (National Overview)
// ─────────────────────────────────────────────

function renderCityCards() {
  const grid = $('city-cards-grid');
  if (!grid) return;

  grid.innerHTML = CITIES.map(city => {
    const deaths = calculatePreventableDeaths(city);
    return `
      <div class="city-card ${city.status}"
           id="card-${city.id}"
           role="button"
           tabindex="0"
           aria-label="${city.name}  -  ${city.statusLabel}"
           onclick="selectCity('${city.id}')"
           onkeydown="if(event.key==='Enter'||event.key===' ')selectCity('${city.id}')">
        <div class="card-city-name">${city.name}</div>
        <div class="card-state">${city.state}</div>
        <div class="card-status ${city.status}">${statusLabel(city.status)}</div>
        <div class="card-counter" id="card-counter-${city.id}">${deaths.toFixed(2)}</div>
        <div class="card-counter-label">est. preventable deaths<br>since delay start</div>
        <div class="card-blocker">${city.keyBlocker}</div>
      </div>`;
  }).join('');
}

function statusLabel(status) {
  if (status === 'blocked') return '🔴 Effectively Blocked';
  if (status === 'limbo')   return '🟡 Regulatory Limbo';
  return '🟢 Operational';
}

// ─────────────────────────────────────────────
// CITY SELECTION
// ─────────────────────────────────────────────

function selectCity(cityId) {
  const city = CITIES.find(c => c.id === cityId);
  if (!city) return;

  activeCityId = cityId;

  // Update active card styling
  document.querySelectorAll('.city-card').forEach(el => el.classList.remove('active'));
  const activeCard = $(`card-${cityId}`);
  if (activeCard) activeCard.classList.add('active');

  // Update header nav
  document.querySelectorAll('.nav-pill[data-city]').forEach(el => {
    el.classList.toggle('active', el.dataset.city === cityId);
  });

  // Render city detail
  renderCityDetail(city);

  // Scroll to detail
  const detailEl = $('city-detail');
  if (detailEl) {
    setTimeout(() => detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
}

// ─────────────────────────────────────────────
// CITY DETAIL PANEL
// ─────────────────────────────────────────────

function renderCityDetail(city) {
  const wrapper = $('city-detail-wrapper');
  if (!wrapper) return;

  const deaths = calculatePreventableDeaths(city);

  wrapper.innerHTML = `
    <div class="city-detail-inner visible scroll-anchor" id="city-detail-content">
      <!-- Header -->
      <div class="city-detail-header">
        <div class="container">
          <div>
            <div class="city-detail-name">${city.name}</div>
            <div class="city-detail-state">${city.state}</div>
            <div class="card-status ${city.status}" style="display:inline-flex">${statusLabel(city.status)}</div>
            ${city.primaryOppositionReason ? `<div style="margin-top:10px;font-size:13px;color:var(--text-muted)">Primary driver of delay: <strong style="color:var(--text-primary)">${city.primaryOppositionReason}</strong></div>` : ''}
          </div>
          <div>
            <div class="city-counter-large" id="city-counter-main">${deaths.toFixed(4)}</div>
            <div class="city-counter-label">est. preventable deaths since<br>${formatDate(city.delayStartDate)}</div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="container">
        <div class="detail-tabs" id="detail-tabs">
          ${['delay','data','blockers','methodology'].map(t => `
            <button class="detail-tab ${t === activeTabId ? 'active' : ''}"
                    onclick="switchTab('${t}')" data-tab="${t}">
              ${tabName(t)}
            </button>`).join('')}
        </div>

        <!-- Tab: The Delay -->
        <div class="tab-panel ${activeTabId === 'delay' ? 'active' : ''}" id="tab-delay">
          <div class="subsection-title">Regulatory Timeline</div>
          ${renderTimeline(city)}
          ${city.legislation.length ? `
            <div class="subsection-title">Legislation</div>
            ${renderLegislation(city)}` : ''}
          ${city.quotes.length ? `
            <div class="subsection-title">Key Quotes</div>
            ${renderQuotes(city)}` : ''}
        </div>

        <!-- Tab: The Data -->
        <div class="tab-panel ${activeTabId === 'data' ? 'active' : ''}" id="tab-data">
          <div class="subsection-title">Traffic Fatalities  -  ${city.name}</div>
          <div class="chart-container">
            <div class="chart-title">Annual Traffic Fatalities (red = after delay start date)</div>
            <canvas id="city-fatality-chart" height="180"></canvas>
          </div>

          <div class="subsection-title">Key Statistics</div>
          ${renderKeyStats(city)}

          <div class="subsection-title">Counter Breakdown</div>
          ${renderCounterBreakdown(city)}

          ${city.challenges.length ? `
            <div class="subsection-title">Honest Challenges</div>
            <div class="challenges-list">
              ${city.challenges.map(c => `<div class="challenge-item">${c}</div>`).join('')}
            </div>` : ''}
        </div>

        <!-- Tab: Who's Blocking It -->
        <div class="tab-panel ${activeTabId === 'blockers' ? 'active' : ''}" id="tab-blockers">
          <div class="subsection-title">Blocking Deployment</div>
          <div class="people-grid">
            ${city.blockers.map(p => `
              <div class="person-card blocker">
                <div class="person-name">${p.name}</div>
                <div class="person-role">${p.role}</div>
                <div class="person-desc">${p.description}</div>
              </div>`).join('')}
          </div>

          ${city.supporters.length ? `
            <div class="subsection-title">Supporting Deployment</div>
            <div class="people-grid">
              ${city.supporters.map(p => `
                <div class="person-card supporter">
                  <div class="person-name">${p.name}</div>
                  <div class="person-role">${p.role}</div>
                  <div class="person-desc">${p.description}</div>
                </div>`).join('')}
            </div>` : ''}
        </div>

        <!-- Tab: Methodology -->
        <div class="tab-panel ${activeTabId === 'methodology' ? 'active' : ''}" id="tab-methodology">
          <div class="subsection-title">City-Specific Assumptions</div>
          <div class="method-card">
            <div class="method-body">
              <p><strong>Delay start date:</strong> ${formatDate(city.delayStartDate)}</p>
              <p><strong>Annual fatalities used:</strong> ${Object.entries(city.annualFatalities).map(([y,v]) => `${y}: ${v}`).join(' · ')}</p>
              <p><strong>Crash reduction factor:</strong> 85% (Kusano et al. 2024/2025)</p>
              <p><strong>VMT share assumption:</strong> 10% (Fehr & Peers 2019, conservative proxy)</p>
              <p><strong>Effective factor:</strong> 85% × 10% = 8.5% of annual city fatalities</p>
              <p class="mt-4" style="color:var(--text-muted)">
                <strong>Methodology caveat:</strong> This calculation asks: if ride-hail-equivalent autonomous vehicles had been operating since the delay start date, capturing ~10% of VMT,
                how many crashes would have been prevented given Waymo's demonstrated 85% crash reduction? It is an estimate of opportunity cost, not a certainty.
                It does not account for induced demand, network effects, or non-Waymo AV providers.
              </p>
            </div>
            <div class="method-sources">
              ${city.sources.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${s.title} ↗</a>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // Start city-specific counter
  const cityCounterEl = $('city-counter-main');
  if (cityCounterEl) {
    startCityCounter(cityCounterEl, city);
  }

  // Render fatality chart after DOM is ready
  if (activeTabId === 'data') {
    requestAnimationFrame(() => renderFatalityChart('city-fatality-chart', city));
  }
}

function tabName(id) {
  const names = { delay: 'The Delay', data: 'The Data', blockers: "Who's Blocking It", methodology: 'Methodology' };
  return names[id] || id;
}

function switchTab(tabId) {
  activeTabId = tabId;

  document.querySelectorAll('.detail-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tabId}`);
  });

  // Render chart when switching to data tab
  if (tabId === 'data' && activeCityId) {
    const city = CITIES.find(c => c.id === activeCityId);
    if (city) requestAnimationFrame(() => renderFatalityChart('city-fatality-chart', city));
  }
}

// ─────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────

function renderTimeline(city) {
  const delayStart = new Date(city.delayStartDate);

  return `<div class="timeline">
    ${city.timeline.map((item, i) => {
      // Try to parse event date to see if it's after delay start
      const isAfterDelay = isEventAfterDelay(item.date, delayStart);
      return `
        <div class="timeline-item ${isAfterDelay ? 'highlight' : ''}">
          <div class="timeline-dot"></div>
          <div class="timeline-date">${item.date}</div>
          <div class="timeline-event">${item.event}</div>
        </div>`;
    }).join('')}
  </div>`;
}

function isEventAfterDelay(dateStr, delayStart) {
  // Try to extract year from strings like "Mar 2026", "Late 2025", "2025"
  const match = dateStr.match(/\b(20\d\d)\b/);
  if (!match) return false;
  const year = parseInt(match[1]);
  return year >= delayStart.getFullYear();
}

function renderLegislation(city) {
  return `<div class="legislation-list">
    ${city.legislation.map(l => {
      const stanceLabel = { pro: 'Pro-Deployment', restrictive: 'Restrictive', partial: 'Partial', pending: 'Pending' }[l.stance] || l.stance;
      const links = (l.urls && l.urls.length)
        ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px">${l.urls.map(u => `<a href="${u.url}" target="_blank" rel="noopener" style="font-size:11px">${u.label} ↗</a>`).join('')}</div>`
        : '';
      return `
        <div class="legislation-item ${l.stance}">
          <div class="legislation-id">${l.id}</div>
          <div class="legislation-stance-badge">${stanceLabel}</div>
          <div class="legislation-desc">${l.description}</div>
          ${links}
        </div>`;
    }).join('')}
  </div>`;
}

function renderQuotes(city) {
  return city.quotes.map(q => `
    <div class="quote-block">
      <div class="quote-text">${q.text}</div>
      <div class="quote-attribution"> -  ${q.attribution}${q.context ? ` <span class="quote-context">· ${q.context}</span>` : ''}</div>
    </div>`).join('');
}

function renderKeyStats(city) {
  return `<ul class="key-stats-list">
    ${city.keyStats.map(s => `<li>${s}</li>`).join('')}
  </ul>`;
}

function renderCounterBreakdown(city) {
  const now = new Date();
  const deaths = calculatePreventableDeaths(city, now);
  const delayStart = new Date(city.delayStartDate);
  const monthsElapsed = (now - delayStart) / (1000 * 60 * 60 * 24 * 30.44);

  // Rough cumulative fatalities
  const totalFatalities = deaths / COUNTER_METHODOLOGY.effectiveFactor;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Delay duration</div>
        <div class="stat-value text-mono">${monthsElapsed.toFixed(0)} mo</div>
        <div class="stat-note">Since ${formatDate(city.delayStartDate)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Est. total fatalities during delay</div>
        <div class="stat-value text-mono">${totalFatalities.toFixed(1)}</div>
        <div class="stat-note">City-level, interpolated</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">VMT share assumption</div>
        <div class="stat-value text-mono">10%</div>
        <div class="stat-note">Conservative proxy (Fehr & Peers 2019)</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Crash reduction (Waymo)</div>
        <div class="stat-value text-mono">85%</div>
        <div class="stat-note">Kusano et al. (2024/2025)</div>
      </div>
      <div class="stat-card" style="border-color:var(--red)">
        <div class="stat-label">Estimated preventable deaths</div>
        <div class="stat-value text-mono text-red">${deaths.toFixed(4)}</div>
        <div class="stat-note">= total fatalities × 10% VMT × 85% reduction</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Current rate</div>
        <div class="stat-value text-mono">${(getPreventableDeathRate(city) * 365.25 * 24 * 3600).toFixed(2)}</div>
        <div class="stat-note">Estimated preventable deaths per year</div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// COMPARISON SECTION
// ─────────────────────────────────────────────

function renderOperationalCities() {
  const container = $('op-cities-grid');
  if (!container) return;

  container.innerHTML = OPERATIONAL_CITIES.map(city => {
    const monthsStr = city.monthsToLaunch != null
      ? `<div class="op-city-months">${city.monthsToLaunch}</div><div class="op-city-months-label">months to launch</div>`
      : `<div class="op-city-months" style="color:var(--green)">✓</div><div class="op-city-months-label">operational</div>`;
    return `
      <div class="op-city-card">
        <div class="op-city-name">${city.name}</div>
        ${monthsStr}
        <div class="op-city-note">${city.note}</div>
      </div>`;
  }).join('');
}

function renderStatusTable() {
  const tbody = $('status-table-body');
  if (!tbody) return;

  const allCities = [
    ...CITIES,
    ...OPERATIONAL_CITIES.map(c => ({
      id: 'op-' + c.name,
      name: c.name.split(',')[0],
      state: c.name.split(', ')[1] || '',
      status: 'operational',
      statusLabel: 'Operational',
      delayStartDate: null,
      keyBlocker: `Commercial driverless service since ${c.launchYear}`,
    })),
  ];

  tbody.innerHTML = allCities.map(city => {
    const deaths = city.status !== 'operational' && city.delayStartDate
      ? calculatePreventableDeaths(city).toFixed(2)
      : ' - ';
    return `
      <tr>
        <td><strong>${city.name}</strong><br><span style="color:var(--text-muted);font-size:11px">${city.state}</span></td>
        <td><span class="status-dot ${city.status}"></span>${city.statusLabel || city.status}</td>
        <td style="font-family:var(--font-mono);color:${city.status !== 'operational' ? 'var(--red)' : 'var(--text-muted)'}">${deaths}</td>
        <td style="color:var(--text-secondary);font-size:12px">${city.keyBlocker}</td>
      </tr>`;
  }).join('');
}

function renderNationalBreakdown() {
  const container = $('national-breakdown');
  if (container) renderNationalBreakdownHTML(container);
}

// ─────────────────────────────────────────────
// ANIMATED COUNTERS
// ─────────────────────────────────────────────

const ANIM_DURATION = 2000; // ms for initial count-up animation

function startCounters() {
  counters = [];

  // National hero counter
  const heroEl = $('national-counter-value');
  if (heroEl) {
    const target = calculateNationalPreventableDeaths();
    const rate = getNationalDeathRate();
    counters.push({ el: heroEl, target, rate, digits: 2, startTs: null });
  }

  // Card counters
  CITIES.forEach(city => {
    const el = $(`card-counter-${city.id}`);
    if (el) {
      const target = calculatePreventableDeaths(city);
      const rate = getPreventableDeathRate(city);
      counters.push({ el, target, rate, digits: 2, startTs: null });
    }
  });

  rafId = requestAnimationFrame(tickCounters);
}

function startCityCounter(el, city) {
  // Remove any existing city counter entry
  counters = counters.filter(c => c.el.id !== 'city-counter-main');

  const target = calculatePreventableDeaths(city);
  const rate = getPreventableDeathRate(city);
  counters.push({ el, target, rate, digits: 4, startTs: null });
}

function tickCounters(timestamp) {
  counters.forEach(counter => {
    if (!counter.startTs) {
      counter.startTs = timestamp;
      counter.animStartValue = 0;
    }

    const elapsed = timestamp - counter.startTs;

    let displayValue;
    if (elapsed < ANIM_DURATION) {
      // Ease-out cubic animation from 0 → target
      const progress = elapsed / ANIM_DURATION;
      const eased = 1 - Math.pow(1 - progress, 3);
      displayValue = counter.target * eased;
    } else {
      // Real-time increment: add time elapsed beyond animation × rate
      const extraSeconds = (elapsed - ANIM_DURATION) / 1000;
      displayValue = counter.target + (extraSeconds * counter.rate);
    }

    counter.el.textContent = displayValue.toFixed(counter.digits);
  });

  rafId = requestAnimationFrame(tickCounters);
}

// ─────────────────────────────────────────────
// HEADER NAV
// ─────────────────────────────────────────────

function initHeaderNav() {
  const nav = $('header-nav');
  if (!nav) return;

  nav.innerHTML = CITIES.map(city => `
    <button class="nav-pill" data-city="${city.id}" onclick="selectCity('${city.id}')">
      ${city.name}
    </button>`).join('') +
    `<button class="nav-pill" onclick="scrollToSection('comparison')">Compare</button>
     <button class="nav-pill" onclick="scrollToSection('methodology')">Methodology</button>`;
}

function initScrollCTA() {
  const btn = $('scroll-to-cities');
  if (btn) {
    btn.addEventListener('click', () => scrollToSection('city-grid'));
  }
}

function scrollToSection(id) {
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─────────────────────────────────────────────
// COMPARISON CHARTS
// ─────────────────────────────────────────────

// Render comparison charts after Chart.js is loaded
window.addEventListener('load', () => {
  renderTimeToLaunchChart('time-to-launch-chart');
  renderSafetyChart('safety-comparison-chart');
});

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00'); // force local parse
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
