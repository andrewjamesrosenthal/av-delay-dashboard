'use strict';

// ─────────────────────────────────────────────
// SHARED METHODOLOGY
// ─────────────────────────────────────────────

const COUNTER_METHODOLOGY = {
  crashReductionFactor: 0.85,
  vmtShareFactor: 0.10,
  effectiveFactor: 0.085, // 85% crash reduction × 10% VMT share
  description: 'Applies Kusano et al. (2024/2025) 85% crash reduction to estimated 10% ride-hail VMT share (Fehr & Peers 2019, conservative proxy for all cities).',
  vmtSource: 'Fehr & Peers (2019): Ride-hail is 1–13% of city-core VMT across major US cities. DC: 6.9%, SF: 12.8%. 10% used as conservative proxy.',
};

const WAYMO_SAFETY = {
  injuryCrashReduction: 0.85,
  pedestrianInjuryReduction: 0.92,
  intersectionCrashReduction: 0.96,
  miles2024: 7100000,
  miles2025: 56700000,
  sources: [
    {
      title: 'Kusano et al. (2024)',
      url: 'https://doi.org/10.1080/15389588.2024.2380786',
      description: '85% fewer any-injury-reported crashes, 7.1M miles analyzed',
    },
    {
      title: 'Kusano et al. (2025)',
      url: 'https://doi.org/10.1080/15389588.2025.2499887',
      description: '85% fewer suspected serious injury+ crashes; 79% fewer any-injury-reported crashes; 56.7M miles analyzed',
    },
    {
      title: 'Swiss Re / Waymo (2024)',
      url: 'https://www.swissre.com/institute/research/topics-and-risk-dialogues/digital-business-model-and-cyber-risk/autonomous-vehicles-waymo-insurance.html',
      description: 'Zero bodily injury claims vs. human driver baseline',
    },
  ],
};

// Safety rate comparison (methodologies differ  -  see note)
// Sources: Waymo via Kusano et al. (2024); Uber US Safety Report 2019-2020; Lyft Community Safety Report 2021-2022; NHTSA Traffic Safety Facts
const SAFETY_COMPARISON = [
  { provider: 'Waymo', metric: 'Serious injuries / million miles', rate: 0.02, note: 'Police-reported', sourceUrl: 'https://doi.org/10.1080/15389588.2024.2380786' },
  { provider: 'Uber', metric: 'Accidents / million miles', rate: 0.45, note: 'Self-reported', sourceUrl: 'https://www.uber.com/us/en/about/reports/us-safety-report/' },
  { provider: 'Lyft', metric: 'Accidents / million miles', rate: 0.38, note: 'Self-reported', sourceUrl: 'https://www.lyft.com/safety' },
  { provider: 'US Average', metric: 'Fatalities / 100M VMT', rate: 1.35, note: 'NHTSA', sourceUrl: 'https://crashstats.nhtsa.dot.gov/' },
];

// Causes of crashes AVs eliminate
// Source: NHTSA Traffic Safety Facts (annual); NHTSA risky driving data
const CRASH_CAUSES = [
  { cause: 'Drunk driving', share: 0.31, avElimination: 'AVs don\'t drink', color: '#f85149', sourceUrl: 'https://www.nhtsa.gov/risky-driving/drunk-driving' },
  { cause: 'Speeding', share: 0.29, avElimination: 'AVs obey speed limits', color: '#d29922', sourceUrl: 'https://www.nhtsa.gov/risky-driving/speeding' },
  { cause: 'Distracted driving', share: 0.09, avElimination: 'AVs don\'t text', color: '#58a6ff', sourceUrl: 'https://www.nhtsa.gov/risky-driving/distracted-driving' },
];

// ─────────────────────────────────────────────
// OPERATIONAL CITIES (for contrast section)
// ─────────────────────────────────────────────

const OPERATIONAL_CITIES = [
  { name: 'Phoenix, AZ', launchYear: 2020, monthsToLaunch: null, note: 'First-ever commercial driverless service (2020). 5+ years operational.' },
  { name: 'San Francisco, CA', launchYear: 2023, monthsToLaunch: null, note: 'Commercial launch 2023. Now includes freeway driving.' },
  { name: 'Los Angeles, CA', launchYear: 2024, monthsToLaunch: 12, note: '~12 months from testing to commercial launch.' },
  { name: 'Austin, TX', launchYear: 2024, monthsToLaunch: 15, note: '~15 months from testing to launch. Available via Uber app.' },
  { name: 'Atlanta, GA', launchYear: 2024, monthsToLaunch: 5, note: '~5 months from testing to launch. Available via Uber app.' },
  { name: 'Miami, FL', launchYear: 2026, monthsToLaunch: null, note: 'Planned 2026 expansion.' },
  { name: 'Dallas, TX', launchYear: 2026, monthsToLaunch: null, note: 'Avride also entering market.' },
];

// ─────────────────────────────────────────────
// BLOCKED / LIMBO CITIES
// ─────────────────────────────────────────────

const CITIES = [
  // ───────── BOSTON ─────────
  {
    id: 'boston',
    name: 'Boston',
    state: 'Massachusetts',
    status: 'blocked',       // 'blocked' | 'limbo' | 'operational'
    statusLabel: 'Effectively Blocked',
    delayStartDate: '2025-06-01', // When commercial deployment first became clearly blocked

    keyBlocker: 'No state AV framework + city ordinance requiring human operator and labor study',

    // Annual traffic fatalities (city level unless noted)
    // Source: Vision Zero Boston / Analyze Boston; MassDOT IMPACT; NHTSA FARS
    annualFatalities: {
      2019: 20,
      2020: 20,
      2021: 20,
      2022: 20,
      2023: 16,
      2024: 18,
      2025: 18,  // projected
      2026: 18,  // projected
    },

    keyStats: [
      '~34% of MA fatal crashes involve drunk driving (above national avg of 31%)',
      '8 pedestrian fatalities in Boston in 2024',
      '137 pedestrian-involved crashes in Boston in 2024',
      'MA statewide: 343 deaths (2023) → 368 deaths (2024), a 7.3% increase',
      'MA has lowest fatality rate per VMT in US (0.51/100M VMT) but still ~1 death/day statewide',
      'Boston deaths + serious injuries trending UP in past 2 years despite Vision Zero',
    ],

    drunkDrivingShare: 0.34,

    timeline: [
      { date: 'Oct 2016', event: 'Gov. Baker signs EO 572 supporting AV testing in Massachusetts' },
      { date: '2017', event: 'NuTonomy (now Motional) begins AV testing with safety driver' },
      { date: 'Jan 2024', event: 'Motional receives 2-year MassDOT testing permit (safety driver required, ≤35 mph)' },
      { date: 'May 2025', event: 'Waymo begins mapping Boston streets with human drivers' },
      { date: 'June 2025', event: 'Two competing state bills introduced  -  industry-backed framework (H.3634/S.2379) and Teamsters-backed human-operator mandate (S.2393/H.3669)' },
      { date: 'July 2025', event: 'City Council hearing. Chief of Streets Franklin-Hodge skeptical. Councilors Murphy & Santana introduce ordinance. "Labor United Against Waymo" coalition forms.' },
      { date: 'Oct 2025', event: 'Second packed City Hall hearing. No vote taken. Ordinance would require human operator + labor advisory board + July 2026 study.' },
      { date: 'Feb 2026', event: 'Waymo announces Boston expansion goal, urges state action. Both state bills still in committee. Industry warns MA losing competitive edge.' },
      { date: 'Mar 2026', event: 'S.2393 reporting deadline extended to March 31. Still no framework. No commercial AV service permitted.' },
    ],

    legislation: [
      {
        id: 'H.3634 / S.2379',
        stance: 'pro',
        description: 'Industry-backed: Regulatory framework for commercial AV deployment. In committee ~1 year. House bill had March 18, 2026 committee deadline.',
        urls: [
          { label: 'H.3634 (MA Legislature)', url: 'https://malegislature.gov/Bills/194/H3634' },
          { label: 'S.2379 (MA Legislature)', url: 'https://malegislature.gov/Bills/194/S2379' },
        ],
      },
      {
        id: 'S.2393 / H.3669',
        stance: 'restrictive',
        description: 'Teamsters-backed: Requires human safety operator in all AVs  -  effectively bans driverless operation. Reporting date extended to March 31, 2026.',
        urls: [
          { label: 'S.2393 (MA Legislature)', url: 'https://malegislature.gov/Bills/194/S2393' },
          { label: 'H.3669 (MA Legislature)', url: 'https://malegislature.gov/Bills/194/H3669' },
        ],
      },
      {
        id: 'Boston City Ordinance (Oct 2025)',
        stance: 'restrictive',
        description: 'Requires "comprehensive, public, and participatory study" before any AV launch. Creates advisory board dominated by union representation (App Drivers Union, Teamsters Local 25, Greater Boston Labor Council, UFCW). Requires human safety operator (Section 6). Study report due July 1, 2026. No vote taken as of late Oct 2025.',
        urls: [],
      },
    ],

    blockers: [
      { name: 'Councilor Ed Murphy & Councilor Tania Fernandes Anderson (formerly Santana)', role: 'Boston City Council', description: 'Authors of the ordinance requiring human safety operator and labor study' },
      { name: 'Tom Mari, Teamsters Local 25', role: 'Labor', description: 'Leading union opposition focused on protecting driver jobs' },
      { name: 'App Drivers Union & SEIU 32BJ', role: 'Labor coalition', description: '"Labor United Against Waymo" coalition  -  explicitly organized to block deployment' },
      { name: 'Jascha Franklin-Hodge', role: 'Chief of Streets, City of Boston', description: 'Publicly skeptical of Waymo\'s ability to handle Boston\'s streets' },
    ],

    supporters: [
      { name: 'Bay State Council of the Blind', role: 'Disability rights', description: 'AVs would dramatically expand mobility for blind and low-vision residents' },
      { name: 'National Federation of the Blind of MA', role: 'Disability rights', description: 'Support for AV deployment as an accessibility imperative' },
      { name: 'MADD Massachusetts', role: 'Safety advocacy', description: 'AVs eliminate drunk driving  -  the #1 cause of traffic fatalities' },
      { name: 'MA Competitive Partnership', role: 'Industry/Economic', description: 'Warns Massachusetts is falling behind on AV innovation' },
    ],

    quotes: [
      {
        text: '"The first major city in the world to ban fully autonomous vehicles based entirely on vibes."',
        attribution: 'Waymo spokesperson',
        context: 'On the proposed Boston ordinance',
      },
    ],

    challenges: [
      'Waymo has NOT validated its system for snow/ice operations  -  this is a genuine operational concern, not merely a pretext.',
      'Boston\'s historic, narrow street network is genuinely complex  -  among the more challenging US urban environments.',
    ],

    primaryOppositionReason: 'Labor protection (union driver jobs)  -  opposition is explicitly organized around jobs, not safety',

    sources: [
      { title: 'Vision Zero Boston / Analyze Boston (fatality records)', url: 'https://data.boston.gov/dataset/vision-zero-fatality-records' },
      { title: 'MassDOT IMPACT Crash Portal', url: 'https://massdot.maps.arcgis.com/apps/webappviewer/index.html' },
      { title: 'MassDOT Annual Traffic Crashes & Fatalities Data', url: 'https://www.mass.gov/lists/massdot-annual-traffic-crashes-and-fatalities-data' },
      { title: 'NHTSA FARS (fatality data)', url: 'https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars' },
      { title: 'NHTSA: Drunk Driving', url: 'https://www.nhtsa.gov/risky-driving/drunk-driving' },
      { title: 'Mass.gov ADS Information', url: 'https://www.mass.gov/info-details/learn-about-automated-driving-systems-in-massachusetts' },
      { title: 'H.3634 (MA Legislature)', url: 'https://malegislature.gov/Bills/194/H3634' },
      { title: 'S.2393 (MA Legislature)', url: 'https://malegislature.gov/Bills/194/S2393' },
    ],
  },

  // ───────── WASHINGTON, DC ─────────
  {
    id: 'dc',
    name: 'Washington, DC',
    state: 'District of Columbia',
    status: 'limbo',
    statusLabel: 'Regulatory Limbo',
    delayStartDate: '2023-01-01', // When DDOT missed the legally mandated study deadline

    keyBlocker: 'DDOT missed legally mandated safety study; enabling legislation blocked by single council member',

    // Source: DC Vision Zero; Open Data DC; NHTSA FARS
    annualFatalities: {
      2019: 27,
      2020: 37,
      2021: 40,
      2022: 35,
      2023: 52,
      2024: 52,
      2025: 25,  // NSC estimate
      2026: 25,  // projected at 2025 rate
    },

    keyStats: [
      '~30% of DC fatal crashes involve drunk driving',
      '~29% involve speeding',
      '~8% involve distracted driving',
      'DC ride-hail is ~7% of city-core VMT (Fehr & Peers)',
      '52 traffic deaths in both 2023 and 2024  -  alarming upward trend',
      'DDOT had a legal obligation to complete the safety study by late 2022  -  never done',
    ],

    drunkDrivingShare: 0.30,

    timeline: [
      { date: '2020', event: 'DC passes Autonomous Vehicle Testing Program law, mandating a DDOT safety study by late 2022' },
      { date: 'Late 2022', event: 'DDOT misses its legally mandated safety study deadline  -  study never completed' },
      { date: 'Jan 2023', event: 'Delay clock starts: commercial AV deployment blocked without the required study' },
      { date: 'April 2024', event: 'Waymo begins testing in DC with safety drivers' },
      { date: 'July 2025', event: 'Councilmember McDuffie introduces B26-0323 (Autonomous Vehicle Deployment Act)' },
      { date: 'Dec 2025', event: 'Councilmember Allen (Ward 6) blocks/refuses to advance enabling legislation' },
      { date: 'Mar 2026', event: 'Still in regulatory limbo. No AV ride-hail service permitted.' },
    ],

    legislation: [
      {
        id: 'AV Testing Program Act (2020) — DC Law 23-156',
        stance: 'partial',
        description: 'Established AV testing framework and mandated a DDOT safety study by late 2022. DDOT never completed the study  -  blocking the path to commercial deployment.',
        urls: [
          { label: 'DC Law 23-156 (DC Council)', url: 'https://lims.dccouncil.gov/Legislation/B23-0719' },
        ],
      },
      {
        id: 'B26-0323',
        stance: 'pro',
        description: 'Autonomous Vehicle Deployment Act, introduced July 2025 by Councilmember McDuffie. Would enable commercial driverless service. Blocked by Councilmember Allen in December 2025.',
        urls: [
          { label: 'B26-0323 (DC Council)', url: 'https://lims.dccouncil.gov/Legislation/B26-0323' },
        ],
      },
    ],

    blockers: [
      { name: 'DDOT', role: 'DC Department of Transportation', description: 'Missed its legally mandated safety study deadline in late 2022. The missed deadline created the legal void that prevents deployment.' },
      { name: 'Councilmember Charles Allen', role: 'Ward 6 Council Member', description: 'Blocked enabling legislation B26-0323 in December 2025. One individual preventing the entire city from moving forward.' },
    ],

    supporters: [
      { name: 'Councilmember McDuffie', role: 'DC Council', description: 'Author of B26-0323 enabling legislation, pushing for commercial AV service' },
      { name: 'Disability rights advocates', role: 'Accessibility advocates', description: 'AVs would provide critical mobility for residents who cannot drive' },
    ],

    quotes: [],

    challenges: [
      'Dense urban environment with complex intersection geometry and heavy pedestrian/cyclist traffic',
      'Nation\'s capital has unique legal and regulatory complexity',
    ],

    primaryOppositionReason: 'Regulatory inertia (missed legal deadline) and individual council member obstruction',

    sources: [
      { title: 'DC Vision Zero (fatality data)', url: 'https://visionzero.dc.gov/' },
      { title: 'Open Data DC (crash data)', url: 'https://opendata.dc.gov/' },
      { title: 'DC Crash Data Repository', url: 'https://dcgis.maps.arcgis.com/apps/webappviewer/index.html?id=9688c74a6ac74b2e87e36843d24a1f0c' },
      { title: 'B26-0323 (DC Council)', url: 'https://lims.dccouncil.gov/Legislation/B26-0323' },
      { title: 'DC Law 23-156 (AV Testing Program 2020)', url: 'https://lims.dccouncil.gov/Legislation/B23-0719' },
      { title: 'NHTSA FARS', url: 'https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars' },
      { title: 'DC Waymo Dashboard (methodology reference)', url: 'https://tbhochman.github.io/dc-waymo-dashboard/' },
    ],
  },

  // ───────── NEW YORK CITY ─────────
  {
    id: 'nyc',
    name: 'New York City',
    state: 'New York',
    status: 'blocked',
    statusLabel: 'Effectively Blocked',
    delayStartDate: '2025-01-15', // When restrictive medallion bills were introduced, killing pro-deployment momentum

    keyBlocker: 'State law requires licensed human driver; restrictive bills would give taxi medallion owners exclusive AV taxi rights',

    // Source: NYC DOT Vision Zero View (https://www.nycvzv.info/); NHTSA FARS
    // TODO: Verify exact annual figures against NYC DOT crash data at https://www.nycvzv.info/
    annualFatalities: {
      2019: 215,
      2020: 248,
      2021: 273,
      2022: 255,
      2023: 238,
      2024: 230,  // TODO: verify with NYC DOT
      2025: 225,  // TODO: verify with NYC DOT
      2026: 225,  // projected
    },

    keyStats: [
      'NYC typically sees 200–260 traffic fatalities per year (TODO: verify with NYC DOT data)',
      'Largest US city with no path to autonomous vehicle deployment',
      'A793/S2688 would give existing taxi medallion owners exclusive rights to AV taxi licenses',
      'NYC has its own AV testing rules (NYC Rules § 4-17) requiring separate city permits on top of state law',
      'Densest US city  -  where AV safety benefits could be enormous',
    ],

    drunkDrivingShare: 0.31,

    timeline: [
      { date: 'Current law', event: 'NY Vehicle & Traffic Law requires a licensed human driver in every vehicle. No path to driverless operation.' },
      { date: 'Jan 2025', event: 'A793 introduced: Would require AV taxis to be licensed through NYC TLC, but ONLY through existing taxi medallion owners  -  locking out Waymo-style competitors' },
      { date: 'Jan 2025', event: 'S2688 introduced: Senate companion bill to A793' },
      { date: 'Jan 2025', event: 'A3650 introduced: Pro-deployment framework that would allow fully autonomous vehicles without a human driver' },
      { date: 'Feb 2025', event: 'A3650\'s enacting clause stricken  -  the pro-deployment bill is effectively killed' },
      { date: 'Feb 2025', event: 'A4901 introduced: Another pro-deployment framework bill, still in committee' },
      { date: 'May 2025', event: 'S7956 introduced: Would require human safety operator for all AVs over 10,001 lbs' },
      { date: 'Late 2025', event: 'Waymo begins mapping NYC streets with human drivers' },
      { date: '2026', event: 'All bills remain in committee or dead. No legal path to driverless service exists.' },
    ],

    legislation: [
      {
        id: 'A793 / S2688',
        stance: 'restrictive',
        description: 'Would require AV taxis to be licensed through NYC TLC, but ONLY through existing taxi medallion owners. Effectively creates a monopoly for medallion holders and shuts out Waymo-style operators. Sponsors: Assembly Member Lasher (A793), Sen. Hoylman-Sigal (S2688).',
        urls: [
          { label: 'A793 (NY Assembly)', url: 'https://nyassembly.gov/leg/?bn=A793&term=2025' },
          { label: 'S2688 (NY Senate)', url: 'https://www.nysenate.gov/legislation/bills/2025/S2688' },
        ],
      },
      {
        id: 'A3650',
        stance: 'pro',
        description: 'Would allow fully autonomous vehicles without a human driver. Enacting clause was stricken  -  bill is effectively dead.',
        urls: [
          { label: 'A3650 (NY Assembly)', url: 'https://nyassembly.gov/leg/?bn=A3650&term=2025' },
        ],
      },
      {
        id: 'A4901',
        stance: 'pro',
        description: 'Similar pro-deployment framework bill. Still in committee.',
        urls: [
          { label: 'A4901 (NY Assembly)', url: 'https://nyassembly.gov/leg/?bn=A4901&term=2025' },
        ],
      },
      {
        id: 'S7956',
        stance: 'restrictive',
        description: 'Requires human safety operator for all AVs over 10,001 lbs.',
        urls: [
          { label: 'S7956 (NY Senate)', url: 'https://www.nysenate.gov/legislation/bills/2025/S7956' },
        ],
      },
    ],

    blockers: [
      { name: 'Assembly Member Lasher', role: 'NY State Assembly', description: 'Sponsor of A793  -  would restrict AV taxis exclusively to existing taxi medallion licensees' },
      { name: 'Sen. Hoylman-Sigal', role: 'NY State Senate', description: 'Sponsor of S2688, Senate companion to A793' },
      { name: 'Taxi medallion industry', role: 'Industry lobby', description: 'Legislation structured to protect medallion value by giving holders exclusive AV taxi rights  -  individual medallions have sold for up to $1M' },
      { name: 'NY State Legislature', role: 'Legislature', description: 'Pro-deployment bill A3650 was killed; no enabling framework passed' },
    ],

    supporters: [
      { name: 'Disability advocates', role: 'Accessibility', description: 'AVs would expand mobility options for residents unable to drive' },
      { name: 'A4901 sponsors', role: 'Pro-deployment legislators', description: 'Pushing an alternative framework bill in the Assembly' },
    ],

    quotes: [],

    challenges: [
      'World\'s most complex urban driving environment  -  unprecedented pedestrian density, narrow lanes, aggressive driving culture',
      'Existing TLC/medallion regulatory framework creates deep institutional resistance to disruption',
      'NYC\'s own AV testing rules (NYC Rules § 4-17) add another layer of permitting on top of state law',
    ],

    primaryOppositionReason: 'Taxi medallion industry protection  -  legislation designed to preserve medallion value, not address safety',

    sources: [
      { title: 'NYC Vision Zero View (fatality data)', url: 'https://www.nycvzv.info/' },
      { title: 'NYC DOT Crash Data', url: 'https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95' },
      { title: 'NY State Legislature', url: 'https://www.nysenate.gov/' },
      { title: 'A793 (NY Assembly)', url: 'https://nyassembly.gov/leg/?bn=A793&term=2025' },
      { title: 'S2688 (NY Senate)', url: 'https://www.nysenate.gov/legislation/bills/2025/S2688' },
      { title: 'A4901 (NY Assembly)', url: 'https://nyassembly.gov/leg/?bn=A4901&term=2025' },
      { title: 'S7956 (NY Senate)', url: 'https://www.nysenate.gov/legislation/bills/2025/S7956' },
      { title: 'NYC Rules § 4-17 (AV testing permits)', url: 'https://rules.cityofnewyork.us/rule/chapter-4-rules-of-the-city-of-new-york/' },
      { title: 'NHTSA FARS', url: 'https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars' },
    ],
  },

  // ───────── CHICAGO ─────────
  {
    id: 'chicago',
    name: 'Chicago',
    state: 'Illinois',
    status: 'limbo',
    statusLabel: 'Regulatory Limbo',
    delayStartDate: '2025-11-01', // When driverless AVs arrived but no framework existed

    keyBlocker: 'No comprehensive city or state regulatory framework; safety coordination and labor concerns unresolved',

    // Source: Chicago DOT crash data; NHTSA FARS
    // TODO: Verify with Chicago DOT crash portal
    annualFatalities: {
      2019: 130,
      2020: 130,
      2021: 140,
      2022: 135,
      2023: 120,
      2024: 125,  // TODO: verify with Chicago DOT
      2025: 120,  // TODO: verify with Chicago DOT
      2026: 120,  // projected
    },

    keyStats: [
      'Chicago is the third-largest US city',
      'Significant winter weather challenges, similar to Boston',
      'Strong union presence  -  potential for organized labor opposition like Boston',
      'Former FDNY Commissioner published March 2026 Time op-ed calling for mandatory first responder coordination before any city allows AVs',
      'TODO: Verify annual fatality figures with Chicago DOT crash portal',
    ],

    drunkDrivingShare: 0.30,

    timeline: [
      { date: '2025', event: 'Waymo begins mapping and testing in the Chicago area' },
      { date: 'Late 2025 / Early 2026', event: 'Driverless Waymo vehicles spotted on Chicago streets  -  framework still being developed' },
      { date: 'Mar 2026', event: 'Former FDNY Commissioner Laura Kavanagh publishes Time op-ed calling for mandatory first responder coordination, accountability agreements, and ongoing safety audits before any city allows AVs. <a href="https://time.com/7272327/autonomous-vehicles-firefighters-safety-regulations/" target="_blank" rel="noopener">Read op-ed ↗</a>' },
      { date: '2026', event: 'Regulatory framework still being worked out. No commercial AV service permitted.' },
    ],

    legislation: [],

    blockers: [
      { name: 'Laura Kavanagh', role: 'Former FDNY Commissioner', description: 'Published March 2026 Time op-ed calling for mandatory first responder coordination, accountability agreements, and ongoing safety audits before any city permits AVs' },
      { name: 'City and state regulators', role: 'Government', description: 'No comprehensive framework finalized despite driverless vehicles already operating on streets' },
    ],

    supporters: [],

    quotes: [],

    challenges: [
      'Significant winter weather  -  Chicago\'s snow and ice present real AV operational challenges',
      'Third-largest US city with complex, high-volume traffic patterns',
    ],

    primaryOppositionReason: 'Safety coordination concerns and regulatory vacuum  -  framework not yet established',

    sources: [
      { title: 'Chicago DOT', url: 'https://www.chicago.gov/city/en/depts/cdot.html' },
      { title: 'Chicago Traffic Crash Data (City of Chicago Open Data)', url: 'https://data.cityofchicago.org/Transportation/Traffic-Crashes-Crashes/85ca-t3if' },
      { title: 'NHTSA FARS', url: 'https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars' },
      { title: 'Illinois Legislature', url: 'https://www.ilga.gov/' },
      { title: 'Kavanagh, Time (Mar 2026) — first responder coordination op-ed', url: 'https://time.com/7272327/autonomous-vehicles-firefighters-safety-regulations/' },
    ],
  },

  // ───────── SEATTLE ─────────
  {
    id: 'seattle',
    name: 'Seattle',
    state: 'Washington',
    status: 'limbo',
    statusLabel: 'Cautious Approach',
    delayStartDate: '2025-01-01', // State bills stalled at start of 2025 session

    keyBlocker: 'State AV bills stalled; city developing infrastructure but no commercial service permitted',

    // Source: Seattle DOT; NHTSA FARS
    // TODO: Verify with Seattle DOT crash data
    annualFatalities: {
      2019: 22,
      2020: 25,
      2021: 30,
      2022: 32,
      2023: 28,
      2024: 28,  // TODO: verify with Seattle DOT
      2025: 28,  // TODO: verify with Seattle DOT
      2026: 28,  // projected
    },

    keyStats: [
      'Seattle developed first-in-nation Digital Conflict Area Awareness Management Program (2025)  -  shares 911 data with AVs in near real-time',
      'Seattle & Bellevue published AV Strategic Vision in 2023, showing city-level support for eventual deployment',
      'State AV bills carried over to next legislative session without passage',
      'City is taking constructive approach, but state legislature has not acted',
      'TODO: Verify annual fatality figures with Seattle DOT data',
    ],

    drunkDrivingShare: 0.31,

    timeline: [
      { date: '2023', event: 'Seattle & Bellevue publish Autonomous Vehicle Strategic Vision  -  planning for eventual AV integration' },
      { date: '2025', event: 'Seattle develops Digital Conflict Area Awareness Management Program  -  first-in-nation system sharing 911 data with AVs in near real-time' },
      { date: '2025', event: 'State AV bills introduced in Washington Legislature but carried over to next legislative session without passage' },
      { date: '2026', event: 'City monitoring state and federal legislative developments. No commercial AV service permitted.' },
    ],

    legislation: [
      {
        id: 'WA State AV Bills (2025)',
        stance: 'pending',
        description: 'Introduced in 2025 legislative session but carried over to next session without passage. Washington state joins Alaska and Delaware in deferring AV legislation (per Governing.com).',
        urls: [
          { label: 'WA State Legislature AV Bills', url: 'https://app.leg.wa.gov/billsummary/?BillNumber=1933&Year=2025&Initiative=false' },
          { label: 'Governing.com: States deferring AV legislation', url: 'https://www.governing.com/transportation/as-waymo-rolls-out-some-states-are-pumping-the-brakes-on-autonomous-vehicles' },
        ],
      },
    ],

    blockers: [
      { name: 'Washington State Legislature', role: 'Legislature', description: 'AV bills carried over to next session without passage' },
    ],

    supporters: [
      { name: 'Seattle DOT', role: 'City government', description: 'Proactively developing AV infrastructure and strategic vision  -  city-level approach is constructive even as state legislature stalls' },
    ],

    quotes: [],

    challenges: [
      'Washington state weather  -  significant rainfall and occasional snow/ice',
      'Hilly terrain and complex intersections throughout Seattle',
    ],

    primaryOppositionReason: 'Legislative inertia  -  cautious but not overtly hostile approach; state has not passed enabling framework',

    sources: [
      { title: 'Seattle DOT AV Program', url: 'https://www.seattle.gov/transportation/projects-and-programs/programs/autonomous-vehicles' },
      { title: 'Seattle & Bellevue AV Strategic Vision (2023)', url: 'https://www.seattle.gov/documents/Departments/SDOT/Programs/AV/AVStrategicVision2023.pdf' },
      { title: 'Seattle Traffic Safety Report', url: 'https://www.seattle.gov/transportation/projects-and-programs/safety-first/vision-zero/resources' },
      { title: 'Washington State Legislature', url: 'https://leg.wa.gov/' },
      { title: 'NHTSA FARS', url: 'https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars' },
      { title: 'Governing.com: States deferring AV legislation', url: 'https://www.governing.com/transportation/as-waymo-rolls-out-some-states-are-pumping-the-brakes-on-autonomous-vehicles' },
    ],
  },
];

// ─────────────────────────────────────────────
// COUNTER UTILITIES
// ─────────────────────────────────────────────

/**
 * Calculate cumulative preventable deaths for a city since its delay start date.
 * Uses linear interpolation within each year.
 *
 * @param {Object} city - City data object
 * @param {Date} [asOf] - Calculate up to this date (default: now)
 * @returns {number} Estimated preventable deaths
 */
function calculatePreventableDeaths(city, asOf) {
  if (!asOf) asOf = new Date();
  const startDate = new Date(city.delayStartDate);
  if (asOf <= startDate) return 0;

  let totalFatalities = 0;
  const startYear = startDate.getFullYear();
  const endYear = asOf.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    const yearFatalities = city.annualFatalities[year];
    if (yearFatalities == null) continue;

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const yearMs = yearEnd - yearStart;

    const periodStart = (year === startYear) ? startDate : yearStart;
    const periodEnd = (year === endYear) ? asOf : yearEnd;

    const fraction = Math.max(0, (periodEnd - periodStart) / yearMs);
    totalFatalities += yearFatalities * fraction;
  }

  return totalFatalities * COUNTER_METHODOLOGY.effectiveFactor;
}

/**
 * Get the current preventable deaths per second rate for a city.
 *
 * @param {Object} city
 * @returns {number} Preventable deaths per second
 */
function getPreventableDeathRate(city) {
  const now = new Date();
  const year = now.getFullYear();
  const annual = city.annualFatalities[year] ?? city.annualFatalities[year - 1] ?? 0;
  return (annual * COUNTER_METHODOLOGY.effectiveFactor) / (365.25 * 24 * 3600);
}

/**
 * Calculate cumulative preventable deaths across ALL tracked cities.
 *
 * @param {Date} [asOf]
 * @returns {number}
 */
function calculateNationalPreventableDeaths(asOf) {
  return CITIES.reduce((sum, city) => sum + calculatePreventableDeaths(city, asOf), 0);
}

/**
 * Get the current national preventable death rate (per second).
 *
 * @returns {number}
 */
function getNationalDeathRate() {
  return CITIES.reduce((sum, city) => sum + getPreventableDeathRate(city), 0);
}
