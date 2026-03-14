require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 8080;
const EXPORTS_DIR = path.join(__dirname, 'exports');

fs.mkdirSync(EXPORTS_DIR, { recursive: true });

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'cse135-hw5-reporting',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'collector',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cse135_analytics',
  waitForConnections: true,
  connectionLimit: 10
});

const SECTION_CATALOG = {
  performance: {
    slug: 'performance',
    title: 'Performance Report',
    description: 'Page speed trends and loading quality metrics.',
    href: '/reports/performance'
  },
  behavior: {
    slug: 'behavior',
    title: 'User Behavior Report',
    description: 'Interaction patterns, engagement, and activity flows.',
    href: '/reports/behavior'
  },
  platform_health: {
    slug: 'platform_health',
    title: 'Platform / Client Health Report',
    description: 'Client capabilities, errors, and environment stability.',
    href: '/reports/platform-health'
  }
};

const SAVED_REPORT_LINKS = [
  { label: 'Saved Performance Snapshot', href: '/reports/saved/performance-snapshot' },
  { label: 'Saved Behavior Snapshot', href: '/reports/saved/behavior-snapshot' },
  { label: 'Saved Platform Health Snapshot', href: '/reports/saved/platform-health-snapshot' }
];

const VALID_ROLES = ['super_admin', 'analyst', 'viewer'];
const VALID_SECTION_SLUGS = Object.keys(SECTION_CATALOG);
const SESSION_JOURNEY_EVENT_TYPES = [
  'activity_click',
  'activity_scroll',
  'activity_keydown',
  'activity_keyup',
  'activity_idle',
  'activity_leave',
  'activity_enter',
  'activity_mousemove'
];

function canAccessSessionJourney(user) {
  if (!user) {
    return false;
  }

  if (user.role === 'super_admin') {
    return true;
  }

  return user.role === 'analyst' && (user.sections || []).includes('behavior');
}

function getAccessibleSections(user) {
  if (!user) {
    return [];
  }

  if (user.role === 'super_admin') {
    return Object.values(SECTION_CATALOG);
  }

  if (user.role !== 'analyst') {
    return [];
  }

  return (user.sections || [])
    .map((slug) => SECTION_CATALOG[slug])
    .filter(Boolean);
}

function getNavLinks(user) {
  const links = user ? [{ label: 'Dashboard', href: '/dashboard' }] : [{ label: 'Login', href: '/login' }];
  if (!user) {
    return links;
  }

  if (user.role === 'super_admin') {
    links.push({ label: 'Admin', href: '/admin' });
    Object.values(SECTION_CATALOG).forEach((section) => {
      links.push({ label: section.title, href: section.href });
    });
    links.push({ label: 'Saved Reports', href: SAVED_REPORT_LINKS[0].href });
    links.push({ label: 'Session Journey', href: '/reports/session-journey' });
    links.push({ label: 'Event Table', href: '/reports/table' });
    links.push({ label: 'Event Charts', href: '/reports/charts' });
    return links;
  }

  if (user.role === 'analyst') {
    getAccessibleSections(user).forEach((section) => {
      links.push({ label: section.title, href: section.href });
    });
    links.push({ label: 'Saved Reports', href: SAVED_REPORT_LINKS[0].href });
    if (canAccessSessionJourney(user)) {
      links.push({ label: 'Session Journey', href: '/reports/session-journey' });
    }
    return links;
  }

  links.push({ label: 'Saved Reports', href: SAVED_REPORT_LINKS[0].href });
  return links;
}

function buildDashboardViewModel(user, totalEvents) {
  const accessibleSections = getAccessibleSections(user);

  if (user.role === 'super_admin') {
    return {
      title: 'System Overview',
      subtitle: 'Full platform visibility with admin and analytics access.',
      roleLabel: 'Super Admin',
      totalEvents,
      readOnly: false,
      accessibleSections,
      savedLinks: SAVED_REPORT_LINKS,
      adminLinks: [{ label: 'Open Admin Area', href: '/admin' }],
      advancedLinks: [{ label: 'Session Journey (Replay Lite)', href: '/reports/session-journey' }],
      utilityLinks: [
        { label: 'Legacy Event Table', href: '/reports/table' },
        { label: 'Legacy Event Charts', href: '/reports/charts' }
      ]
    };
  }

  if (user.role === 'analyst') {
    const advancedLinks = canAccessSessionJourney(user)
      ? [{ label: 'Session Journey (Replay Lite)', href: '/reports/session-journey' }]
      : [];

    return {
      title: 'Your Assigned Analytics Areas',
      subtitle: 'Only report categories in your assigned scope are shown.',
      roleLabel: 'Analyst',
      totalEvents,
      readOnly: false,
      accessibleSections,
      savedLinks: SAVED_REPORT_LINKS,
      adminLinks: [],
      advancedLinks,
      utilityLinks: []
    };
  }

  return {
    title: 'Saved Reports',
    subtitle: 'Read-only access to curated report snapshots.',
    roleLabel: 'Viewer',
    totalEvents,
    readOnly: true,
    accessibleSections: [],
    savedLinks: SAVED_REPORT_LINKS,
    adminLinks: [],
    advancedLinks: [],
    utilityLinks: []
  };
}

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.navLinks = getNavLinks(req.session.user || null);
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function renderForbidden(req, res, reason) {
  return res.status(403).render('403', {
    username: req.session.user ? (req.session.user.displayName || req.session.user.username) : null,
    role: req.session.user ? req.session.user.role : null,
    reason: reason || 'You do not have permission to access this resource.'
  });
}

function renderServerError(req, res, message) {
  return res.status(500).render('500', {
    message: message || 'An unexpected server error occurred.',
    username: req.session.user ? (req.session.user.displayName || req.session.user.username) : null,
    role: req.session.user ? req.session.user.role : null
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userRole = req.session.user.role;
    if (userRole === 'super_admin') {
      return next();
    }

    if (!roles.includes(userRole)) {
      return renderForbidden(req, res, `Role '${userRole}' is not allowed here.`);
    }

    return next();
  };
}

function requireSectionAccess(sectionSlug) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const { role, sections = [] } = req.session.user;
    if (role === 'super_admin') {
      return next();
    }

    if (role !== 'analyst') {
      return renderForbidden(req, res, `Only analysts with '${sectionSlug}' access can open this section.`);
    }

    if (!sections.includes(sectionSlug)) {
      return renderForbidden(req, res, `Your account is not scoped for the '${sectionSlug}' section.`);
    }

    return next();
  };
}

async function getUserWithSections(username) {
  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.display_name,
       u.password_hash,
       u.role,
       u.is_active,
       us.section_slug
     FROM users u
     LEFT JOIN user_sections us ON u.id = us.user_id
     WHERE u.username = ?`,
    [username]
  );

  if (rows.length === 0) {
    return null;
  }

  const first = rows[0];
  return {
    id: first.id,
    username: first.username,
    displayName: first.display_name,
    passwordHash: first.password_hash,
    role: first.role,
    isActive: Boolean(first.is_active),
    sections: rows
      .map((row) => row.section_slug)
      .filter((slug) => typeof slug === 'string' && slug.length > 0)
  };
}

async function getUserWithSectionsById(userId) {
  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.display_name,
       u.password_hash,
       u.role,
       u.is_active,
       us.section_slug
     FROM users u
     LEFT JOIN user_sections us ON u.id = us.user_id
     WHERE u.id = ?`,
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }

  const first = rows[0];
  return {
    id: first.id,
    username: first.username,
    displayName: first.display_name,
    passwordHash: first.password_hash,
    role: first.role,
    isActive: Boolean(first.is_active),
    sections: rows
      .map((row) => row.section_slug)
      .filter((slug) => typeof slug === 'string' && slug.length > 0)
  };
}

function normalizeSectionsInput(input) {
  const values = Array.isArray(input) ? input : [input];
  return [...new Set(values.filter((slug) => VALID_SECTION_SLUGS.includes(slug)))];
}

async function setUserSections(userId, role, sections) {
  await pool.query(`DELETE FROM user_sections WHERE user_id = ?`, [userId]);

  if (role !== 'analyst' || sections.length === 0) {
    return;
  }

  const placeholders = sections.map(() => '(?, ?)').join(', ');
  const params = sections.flatMap((slug) => [userId, slug]);
  await pool.query(
    `INSERT INTO user_sections (user_id, section_slug)
     VALUES ${placeholders}`,
    params
  );
}

async function loadAdminUsers() {
  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.display_name,
       u.role,
       u.is_active,
       u.created_at,
       GROUP_CONCAT(us.section_slug ORDER BY us.section_slug SEPARATOR ',') AS sections_csv
     FROM users u
     LEFT JOIN user_sections us ON u.id = us.user_id
     GROUP BY u.id, u.username, u.display_name, u.role, u.is_active, u.created_at
     ORDER BY u.created_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    sections: row.sections_csv ? row.sections_csv.split(',') : []
  }));
}

function buildAdminSummary(users) {
  const summary = {
    totalUsers: users.length,
    activeUsers: users.filter((user) => user.isActive).length,
    super_admin: users.filter((user) => user.role === 'super_admin').length,
    analyst: users.filter((user) => user.role === 'analyst').length,
    viewer: users.filter((user) => user.role === 'viewer').length
  };
  return summary;
}

function extractBrowserFamily(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';
  return 'Other';
}

function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'N/A';
  }
  return `${Math.round(Number(value))} ms`;
}

async function buildPerformanceReportData() {
  const [kpiRows] = await pool.query(
    `SELECT
       COUNT(*) AS total_events,
       ROUND(AVG(load_ms), 2) AS avg_load_ms,
       ROUND(MAX(load_ms), 2) AS worst_load_ms
     FROM (
       SELECT
         CAST(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.total_load_ms')) AS DECIMAL(10,2)) AS load_ms
       FROM events
       WHERE event_type = 'performance'
     ) p
     WHERE load_ms IS NOT NULL AND load_ms > 0`
  );

  const [pageRows] = await pool.query(
    `SELECT
       page,
       ROUND(AVG(load_ms), 2) AS avg_load_ms,
       ROUND(MAX(load_ms), 2) AS max_load_ms,
       COUNT(*) AS samples
     FROM (
       SELECT
         COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.page')), ''), 'unknown') AS page,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.total_load_ms')) AS DECIMAL(10,2)) AS load_ms
       FROM events
       WHERE event_type = 'performance'
     ) p
     WHERE load_ms IS NOT NULL AND load_ms > 0
     GROUP BY page
     ORDER BY avg_load_ms DESC
     LIMIT 8`
  );

  const [bucketRows] = await pool.query(
    `SELECT bucket, COUNT(*) AS count
     FROM (
       SELECT CASE
         WHEN load_ms < 1000 THEN '<1s'
         WHEN load_ms < 2000 THEN '1-2s'
         WHEN load_ms < 3000 THEN '2-3s'
         WHEN load_ms < 5000 THEN '3-5s'
         ELSE '5s+'
       END AS bucket
       FROM (
         SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.total_load_ms')) AS DECIMAL(10,2)) AS load_ms
         FROM events
         WHERE event_type = 'performance'
       ) p
       WHERE load_ms IS NOT NULL AND load_ms > 0
     ) b
     GROUP BY bucket
     ORDER BY FIELD(bucket, '<1s', '1-2s', '2-3s', '3-5s', '5s+')`
  );

  const [trendRows] = await pool.query(
    `SELECT
       DATE(created_at) AS day,
       ROUND(AVG(load_ms), 2) AS avg_load_ms
     FROM (
       SELECT
         created_at,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.total_load_ms')) AS DECIMAL(10,2)) AS load_ms
       FROM events
       WHERE event_type = 'performance'
     ) p
     WHERE load_ms IS NOT NULL AND load_ms > 0
     GROUP BY DATE(created_at)
     ORDER BY day DESC
     LIMIT 14`
  );

  const totals = kpiRows[0] || { total_events: 0, avg_load_ms: null, worst_load_ms: null };
  const slowestPage = pageRows[0] || null;
  const trendAscending = [...trendRows].reverse();

  return {
    slug: 'performance',
    title: 'Performance Report',
    subtitle: 'Load-time quality, slow-page prioritization, and timing distribution.',
    kpis: [
      { label: 'Performance Events', value: Number(totals.total_events || 0), hint: 'Valid load measurements captured.' },
      { label: 'Average Load Time', value: formatMs(totals.avg_load_ms), hint: 'Overall average from performance telemetry.' },
      { label: 'Slowest Page (Avg)', value: slowestPage ? slowestPage.page : 'N/A', hint: slowestPage ? `${formatMs(slowestPage.avg_load_ms)} avg` : 'No page data yet.' },
      { label: 'Worst Recorded Load', value: formatMs(totals.worst_load_ms), hint: 'Peak observed load duration.' }
    ],
    charts: [
      {
        id: 'performance-by-page',
        title: 'Average Load Time by Page',
        type: 'bar',
        datasetLabel: 'Avg load (ms)',
        labels: pageRows.map((row) => row.page),
        values: pageRows.map((row) => Number(row.avg_load_ms)),
        color: 'rgba(239, 68, 68, 0.75)',
        summary: 'Pages at the top of this chart should be first in the optimization queue.'
      },
      {
        id: 'performance-buckets',
        title: 'Load Time Distribution',
        type: 'bar',
        datasetLabel: 'Page loads',
        labels: bucketRows.map((row) => row.bucket),
        values: bucketRows.map((row) => Number(row.count)),
        color: 'rgba(59, 130, 246, 0.75)',
        summary: 'A healthy profile clusters around the <1s and 1-2s buckets.'
      },
      {
        id: 'performance-trend',
        title: 'Average Load Trend by Day',
        type: 'line',
        datasetLabel: 'Avg load (ms)',
        labels: trendAscending.map((row) => String(row.day)),
        values: trendAscending.map((row) => Number(row.avg_load_ms)),
        color: 'rgba(16, 185, 129, 0.8)',
        summary: 'Use this trend to spot regressions after releases.'
      }
    ],
    table: {
      title: 'Slowest Pages by Average Load',
      columns: [
        { key: 'page', label: 'Page' },
        { key: 'samples', label: 'Samples' },
        { key: 'avg_load_ms', label: 'Avg Load (ms)' },
        { key: 'max_load_ms', label: 'Worst Load (ms)' }
      ],
      rows: pageRows
    },
    commentary: [
      slowestPage
        ? `The most consistently slow page is '${slowestPage.page}' with an average load of ${formatMs(slowestPage.avg_load_ms)}.`
        : 'There is not enough performance data yet to identify a primary bottleneck page.',
      'Prioritize optimization work on pages with both high average load and high sample counts to maximize user-impact reduction.',
      'Track the daily trend after each deployment to quickly detect performance regressions.'
    ]
  };
}

async function buildBehaviorReportData() {
  const [eventTypeRows] = await pool.query(
    `SELECT event_type, COUNT(*) AS count
     FROM events
     WHERE event_type IN ('activity_click', 'activity_scroll', 'activity_keydown', 'activity_keyup', 'activity_idle', 'activity_leave', 'activity_enter', 'activity_mousemove')
     GROUP BY event_type
     ORDER BY count DESC`
  );

  const [pageRows] = await pool.query(
    `SELECT
       page,
       COUNT(*) AS total_interactions,
       SUM(CASE WHEN event_type = 'activity_click' THEN 1 ELSE 0 END) AS clicks,
       SUM(CASE WHEN event_type = 'activity_scroll' THEN 1 ELSE 0 END) AS scrolls,
       SUM(CASE WHEN event_type IN ('activity_keydown', 'activity_keyup') THEN 1 ELSE 0 END) AS key_events,
       SUM(CASE WHEN event_type = 'activity_idle' THEN 1 ELSE 0 END) AS idle_events,
       SUM(CASE WHEN event_type = 'activity_leave' THEN 1 ELSE 0 END) AS leave_events
     FROM (
       SELECT
         event_type,
         COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.page')), ''), 'unknown') AS page
       FROM events
       WHERE event_type IN ('activity_click', 'activity_scroll', 'activity_keydown', 'activity_keyup', 'activity_idle', 'activity_leave', 'activity_enter', 'activity_mousemove')
     ) b
     GROUP BY page
     ORDER BY total_interactions DESC
     LIMIT 10`
  );

  const [sessionRows] = await pool.query(
    `SELECT
       session_id,
       COUNT(*) AS interaction_count,
       SUM(CASE WHEN event_type = 'activity_idle' THEN 1 ELSE 0 END) AS idle_events,
       SUM(CASE WHEN event_type = 'activity_leave' THEN 1 ELSE 0 END) AS leave_events
     FROM events
     WHERE event_type IN ('activity_click', 'activity_scroll', 'activity_keydown', 'activity_keyup', 'activity_idle', 'activity_leave', 'activity_enter', 'activity_mousemove')
       AND session_id IS NOT NULL
     GROUP BY session_id
     ORDER BY interaction_count DESC
     LIMIT 8`
  );

  const totalInteractions = eventTypeRows.reduce((sum, row) => sum + Number(row.count), 0);
  const totalClicks = Number((eventTypeRows.find((row) => row.event_type === 'activity_click') || {}).count || 0);
  const totalScrolls = Number((eventTypeRows.find((row) => row.event_type === 'activity_scroll') || {}).count || 0);
  const topPage = pageRows[0] || null;

  return {
    slug: 'behavior',
    title: 'User Behavior Report',
    subtitle: 'Interaction intensity, engagement patterns, and session activity signals.',
    kpis: [
      { label: 'Interaction Events', value: totalInteractions, hint: 'Clicks, scrolls, key events, idle and leave signals.' },
      { label: 'Most Active Page', value: topPage ? topPage.page : 'N/A', hint: topPage ? `${topPage.total_interactions} interaction events` : 'No page interactions yet.' },
      { label: 'Total Clicks', value: totalClicks, hint: 'Direct click interactions captured.' },
      { label: 'Total Scrolls', value: totalScrolls, hint: 'Scroll interactions captured.' }
    ],
    charts: [
      {
        id: 'behavior-page-activity',
        title: 'Top Pages by Interaction Volume',
        type: 'bar',
        datasetLabel: 'Interactions',
        labels: pageRows.map((row) => row.page),
        values: pageRows.map((row) => Number(row.total_interactions)),
        color: 'rgba(14, 165, 233, 0.8)',
        summary: 'High interaction pages indicate concentrated user attention.'
      },
      {
        id: 'behavior-event-mix',
        title: 'Interaction Mix by Event Type',
        type: 'bar',
        datasetLabel: 'Events',
        labels: eventTypeRows.map((row) => row.event_type),
        values: eventTypeRows.map((row) => Number(row.count)),
        color: 'rgba(99, 102, 241, 0.8)',
        summary: 'Use this mix to understand how users engage beyond clicks.'
      }
    ],
    table: {
      title: 'Page Interaction Breakdown',
      columns: [
        { key: 'page', label: 'Page' },
        { key: 'total_interactions', label: 'Interactions' },
        { key: 'clicks', label: 'Clicks' },
        { key: 'scrolls', label: 'Scrolls' },
        { key: 'key_events', label: 'Key Events' },
        { key: 'idle_events', label: 'Idle' },
        { key: 'leave_events', label: 'Leaves' }
      ],
      rows: pageRows
    },
    secondaryTable: {
      title: 'Most Active Sessions',
      columns: [
        { key: 'session_id_short', label: 'Session' },
        { key: 'interaction_count', label: 'Interactions' },
        { key: 'idle_events', label: 'Idle' },
        { key: 'leave_events', label: 'Leaves' }
      ],
      rows: sessionRows.map((row) => ({
        session_id_short: String(row.session_id).slice(0, 10),
        interaction_count: row.interaction_count,
        idle_events: row.idle_events,
        leave_events: row.leave_events
      }))
    },
    commentary: [
      topPage
        ? `The highest interaction concentration is on '${topPage.page}', which indicates this page is a major engagement hub.`
        : 'There is not enough behavior telemetry yet to identify engagement hotspots.',
      'Compare click-heavy pages against idle and leave counts to identify potential friction points.',
      'Use the active sessions table to inspect whether engagement is broad or concentrated in a few sessions.'
    ]
  };
}

async function buildPlatformHealthReportData() {
  const [staticRows] = await pool.query(
    `SELECT
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.user_agent')), ''), 'unknown') AS user_agent,
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.network')), ''), 'unknown') AS network,
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.allows_css')), ''), 'unknown') AS allows_css,
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.allows_images')), ''), 'unknown') AS allows_images,
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.allows_javascript')), ''), 'unknown') AS allows_javascript
     FROM events
     WHERE event_type = 'static'`
  );

  const [errorRows] = await pool.query(
    `SELECT
       created_at,
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.page')), ''), 'unknown') AS page,
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.message')), ''), 'unknown') AS message,
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.filename')), ''), 'n/a') AS filename
     FROM events
     WHERE event_type = 'activity_error'
     ORDER BY created_at DESC
     LIMIT 12`
  );

  const browserCounts = {};
  const networkCounts = {};
  let cssDisabled = 0;
  let imageDisabled = 0;

  staticRows.forEach((row) => {
    const browser = extractBrowserFamily(row.user_agent);
    browserCounts[browser] = (browserCounts[browser] || 0) + 1;

    const network = row.network || 'unknown';
    networkCounts[network] = (networkCounts[network] || 0) + 1;

    if (String(row.allows_css).toLowerCase() === 'false') {
      cssDisabled += 1;
    }
    if (String(row.allows_images).toLowerCase() === 'false') {
      imageDisabled += 1;
    }
  });

  const [errorCountRows] = await pool.query(
    `SELECT COUNT(*) AS total_errors FROM events WHERE event_type = 'activity_error'`
  );
  const [errorByPageRows] = await pool.query(
    `SELECT
       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(event_data) THEN event_data ELSE NULL END, '$.page')), ''), 'unknown') AS page,
       COUNT(*) AS error_count
     FROM events
     WHERE event_type = 'activity_error'
     GROUP BY page
     ORDER BY error_count DESC
     LIMIT 8`
  );

  const browserSeries = Object.entries(browserCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const networkSeries = Object.entries(networkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const topBrowser = browserSeries[0] ? browserSeries[0][0] : 'N/A';
  const totalErrors = Number((errorCountRows[0] || {}).total_errors || 0);
  const mostAffectedPage = errorByPageRows[0] ? errorByPageRows[0].page : 'N/A';

  return {
    slug: 'platform_health',
    title: 'Platform / Client Health Report',
    subtitle: 'Client environment quality, browser distribution, and error concentration.',
    kpis: [
      { label: 'Technical Events', value: staticRows.length + totalErrors, hint: 'Static environment samples + error events.' },
      { label: 'Top Browser', value: topBrowser, hint: browserSeries[0] ? `${browserSeries[0][1]} sessions` : 'No static data yet.' },
      { label: 'Client Errors', value: totalErrors, hint: 'activity_error events collected.' },
      { label: 'Most Affected Page', value: mostAffectedPage, hint: errorByPageRows[0] ? `${errorByPageRows[0].error_count} errors` : 'No error concentration yet.' }
    ],
    charts: [
      {
        id: 'platform-browser-dist',
        title: 'Browser Distribution',
        type: 'bar',
        datasetLabel: 'Sessions',
        labels: browserSeries.map(([browser]) => browser),
        values: browserSeries.map(([, count]) => count),
        color: 'rgba(168, 85, 247, 0.8)',
        summary: 'Prioritize browser-specific QA around the dominant user agent families.'
      },
      {
        id: 'platform-network-dist',
        title: 'Network Type Distribution',
        type: 'bar',
        datasetLabel: 'Sessions',
        labels: networkSeries.map(([network]) => network),
        values: networkSeries.map(([, count]) => count),
        color: 'rgba(251, 146, 60, 0.85)',
        summary: 'Network mix helps explain perceived performance and reliability variability.'
      }
    ],
    table: {
      title: 'Recent Client-side Errors',
      columns: [
        { key: 'created_at', label: 'Time' },
        { key: 'page', label: 'Page' },
        { key: 'message', label: 'Message' },
        { key: 'filename', label: 'Source' }
      ],
      rows: errorRows.map((row) => ({
        created_at: new Date(row.created_at).toLocaleString(),
        page: row.page,
        message: row.message,
        filename: row.filename
      }))
    },
    commentary: [
      `The leading browser family is ${topBrowser}, so compatibility testing effort should be biased there first.`,
      `Client-side error volume is currently ${totalErrors}, with '${mostAffectedPage}' showing the highest concentration.`,
      `CSS disabled events: ${cssDisabled}. Image disabled events: ${imageDisabled}. Keep progressive enhancement paths healthy for edge clients.`
    ]
  };
}

function getSavedReportConfig(slug) {
  const map = {
    'performance-snapshot': {
      sectionSlug: 'performance',
      title: 'Saved Performance Snapshot',
      builder: buildPerformanceReportData
    },
    'behavior-snapshot': {
      sectionSlug: 'behavior',
      title: 'Saved Behavior Snapshot',
      builder: buildBehaviorReportData
    },
    'platform-health-snapshot': {
      sectionSlug: 'platform_health',
      title: 'Saved Platform Health Snapshot',
      builder: buildPlatformHealthReportData
    }
  };
  return map[slug] || null;
}

function getRawReportConfig(type) {
  const map = {
    performance: {
      reportSlug: 'performance',
      sectionSlug: 'performance',
      exportEndpoint: '/reports/performance/export',
      builder: buildPerformanceReportData
    },
    behavior: {
      reportSlug: 'behavior',
      sectionSlug: 'behavior',
      exportEndpoint: '/reports/behavior/export',
      builder: buildBehaviorReportData
    },
    'platform-health': {
      reportSlug: 'platform_health',
      sectionSlug: 'platform_health',
      exportEndpoint: '/reports/platform-health/export',
      builder: buildPlatformHealthReportData
    }
  };

  return map[type] || null;
}

function canUserAccessReportSlug(user, reportSlug) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;

  if (reportSlug.startsWith('saved:')) {
    const savedSlug = reportSlug.slice('saved:'.length);
    const savedConfig = getSavedReportConfig(savedSlug);
    if (!savedConfig) {
      return false;
    }

    if (user.role === 'viewer') {
      return true;
    }

    if (user.role !== 'analyst') {
      return false;
    }

    return (user.sections || []).includes(savedConfig.sectionSlug);
  }

  if (user.role !== 'analyst') {
    return false;
  }

  return (user.sections || []).includes(reportSlug);
}

function renderReportTemplate(report, options = {}) {
  return new Promise((resolve, reject) => {
    app.render('report', {
      report,
      readOnlyView: options.readOnlyView || false,
      savedLabel: options.savedLabel || null,
      exportEndpoint: options.exportEndpoint || null,
      exportMode: options.exportMode || false,
      generatedAt: options.generatedAt || new Date().toISOString(),
      currentUser: options.currentUser || null,
      navLinks: options.navLinks || []
    }, (err, html) => {
      if (err) return reject(err);
      return resolve(html);
    });
  });
}

async function generatePdfFromHtml(html, filePath) {
  const chromeUserDataDir = path.join(__dirname, '.chrome-profile');
  fs.mkdirSync(chromeUserDataDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: chromeUserDataDir,
    ignoreDefaultArgs: ['--enable-crash-reporter'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-crashpad',
      '--disable-crash-reporter',
      '--no-first-run',
      '--no-zygote'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '12mm',
        bottom: '18mm',
        left: '12mm'
      }
    });
  } finally {
    await browser.close();
  }
}

async function createExportRecord({ reportSlug, generatedByUserId, filename, filters }) {
  const [result] = await pool.query(
    `INSERT INTO report_exports (report_slug, generated_by_user_id, file_path, filters_json)
     VALUES (?, ?, ?, ?)`,
    [reportSlug, generatedByUserId, filename, filters ? JSON.stringify(filters) : null]
  );

  return result.insertId;
}

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  res.render('login', { error: req.query.error || null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/login?error=Invalid%20credentials');
  }

  try {
    const user = await getUserWithSections(username);

    if (!user || !user.isActive) {
      return res.redirect('/login?error=Invalid%20credentials');
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.redirect('/login?error=Invalid%20credentials');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      sections: user.sections
    };

    // Keep compatibility with existing views during migration.
    req.session.authenticated = true;
    req.session.username = user.username;

    return res.redirect('/dashboard');
  } catch (err) {
    console.error('Login failed:', err);
    return res.redirect('/login?error=Login%20error');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM events`
    );
    const totalEvents = rows[0].total;
    const dashboard = buildDashboardViewModel(req.session.user, totalEvents);

    res.render('dashboard', {
      dashboard
    });
  } catch (err) {
    console.error(err);
    return renderServerError(req, res, 'Error loading dashboard');
  }
});

app.get('/reports/table', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const [events] = await pool.query(
      `SELECT id, session_id, event_type, event_data, created_at
       FROM events
       ORDER BY created_at DESC
       LIMIT 50`
    );

    res.render('table', {
      username: req.session.user.displayName || req.session.user.username,
      events
    });
  } catch (error) {
    console.error('Error loading table data:', error);
    return renderServerError(req, res, 'Error loading table data');
  }
});

app.get('/reports/charts', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const [aggregated] = await pool.query(
      `SELECT event_type, COUNT(*) AS count
       FROM events
       GROUP BY event_type
       ORDER BY count DESC`
    );

    const chartData = {
      labels: aggregated.map((row) => row.event_type),
      counts: aggregated.map((row) => Number(row.count))
    };

    res.render('charts', {
      username: req.session.user.displayName || req.session.user.username,
      chartData
    });
  } catch (error) {
    console.error('Error loading chart data:', error);
    return renderServerError(req, res, 'Error loading chart data');
  }
});

app.get('/reports/performance', requireAuth, requireRole('analyst'), requireSectionAccess('performance'), async (req, res) => {
  try {
    const config = getRawReportConfig('performance');
    const report = await buildPerformanceReportData();
    res.render('report', {
      report,
      readOnlyView: false,
      savedLabel: null,
      exportEndpoint: config.exportEndpoint,
      exportMode: false,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error loading performance report:', error);
    return renderServerError(req, res, 'Error loading performance report');
  }
});

app.get('/reports/behavior', requireAuth, requireRole('analyst'), requireSectionAccess('behavior'), async (req, res) => {
  try {
    const config = getRawReportConfig('behavior');
    const report = await buildBehaviorReportData();
    res.render('report', {
      report,
      readOnlyView: false,
      savedLabel: null,
      exportEndpoint: config.exportEndpoint,
      exportMode: false,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error loading behavior report:', error);
    return renderServerError(req, res, 'Error loading behavior report');
  }
});

app.get('/reports/platform-health', requireAuth, requireRole('analyst'), requireSectionAccess('platform_health'), async (req, res) => {
  try {
    const config = getRawReportConfig('platform-health');
    const report = await buildPlatformHealthReportData();
    res.render('report', {
      report,
      readOnlyView: false,
      savedLabel: null,
      exportEndpoint: config.exportEndpoint,
      exportMode: false,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error loading platform health report:', error);
    return renderServerError(req, res, 'Error loading platform health report');
  }
});

app.get('/reports/saved/:slug', requireAuth, requireRole('viewer', 'analyst'), async (req, res) => {
  const config = getSavedReportConfig(req.params.slug);
  if (!config) {
    return res.status(404).render('404', { requestedPath: req.originalUrl });
  }

  try {
    const savedAccessSlug = `saved:${req.params.slug}`;
    if (!canUserAccessReportSlug(req.session.user, savedAccessSlug)) {
      return renderForbidden(req, res, 'You do not have permission to open this saved report.');
    }

    const report = await config.builder();
    report.title = config.title;
    report.subtitle = `${report.subtitle} This is a curated read-only saved view.`;
    return res.render('report', {
      report,
      readOnlyView: true,
      savedLabel: 'Saved Report View',
      exportEndpoint: `/reports/saved/${req.params.slug}/export`,
      exportMode: false,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error loading saved report:', error);
    return renderServerError(req, res, 'Error loading saved report');
  }
});

app.post('/reports/:type/export', requireAuth, requireRole('analyst'), async (req, res) => {
  const config = getRawReportConfig(req.params.type);
  if (!config) {
    return res.status(404).render('404', { requestedPath: req.originalUrl });
  }

  try {
    if (!canUserAccessReportSlug(req.session.user, config.sectionSlug)) {
      return renderForbidden(req, res, `You do not have access to export '${config.sectionSlug}'.`);
    }

    const report = await config.builder();
    const generatedAt = new Date().toISOString();
    const html = await renderReportTemplate(report, {
      exportMode: true,
      generatedAt,
      readOnlyView: false,
      exportEndpoint: null
    });

    const filename = `${config.reportSlug}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
    const filePath = path.join(EXPORTS_DIR, filename);

    await generatePdfFromHtml(html, filePath);
    const exportId = await createExportRecord({
      reportSlug: config.sectionSlug,
      generatedByUserId: req.session.user.id,
      filename,
      filters: {
        source: 'raw',
        reportType: req.params.type,
        generatedAt
      }
    });

    return res.redirect(`/exports/${exportId}`);
  } catch (error) {
    console.error('Error exporting report:', error);
    return renderServerError(req, res, 'Failed to generate report export');
  }
});

app.post('/reports/saved/:slug/export', requireAuth, requireRole('viewer', 'analyst'), async (req, res) => {
  const savedConfig = getSavedReportConfig(req.params.slug);
  if (!savedConfig) {
    return res.status(404).render('404', { requestedPath: req.originalUrl });
  }

  try {
    const exportSlug = `saved:${req.params.slug}`;
    if (!canUserAccessReportSlug(req.session.user, exportSlug)) {
      return renderForbidden(req, res, 'You do not have permission to export this saved report.');
    }

    const report = await savedConfig.builder();
    report.title = savedConfig.title;
    report.subtitle = `${report.subtitle} This is a curated read-only saved view.`;

    const generatedAt = new Date().toISOString();
    const html = await renderReportTemplate(report, {
      exportMode: true,
      generatedAt,
      readOnlyView: true,
      savedLabel: 'Saved Report View',
      exportEndpoint: null
    });

    const filename = `saved-${req.params.slug}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
    const filePath = path.join(EXPORTS_DIR, filename);

    await generatePdfFromHtml(html, filePath);
    const exportId = await createExportRecord({
      reportSlug: exportSlug,
      generatedByUserId: req.session.user.id,
      filename,
      filters: {
        source: 'saved',
        savedSlug: req.params.slug,
        generatedAt
      }
    });

    return res.redirect(`/exports/${exportId}`);
  } catch (error) {
    console.error('Error exporting saved report:', error);
    return renderServerError(req, res, 'Failed to generate saved report export');
  }
});

app.get('/exports/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, report_slug, generated_by_user_id, file_path, created_at
       FROM report_exports
       WHERE id = ?
       LIMIT 1`,
      [req.params.id]
    );

    const exportRow = rows[0];
    if (!exportRow) {
      return res.status(404).render('404', { requestedPath: req.originalUrl });
    }

    if (!canUserAccessReportSlug(req.session.user, exportRow.report_slug)) {
      return renderForbidden(req, res, 'You do not have access to this export file.');
    }

    const filePath = path.join(EXPORTS_DIR, path.basename(exportRow.file_path));
    if (!fs.existsSync(filePath)) {
      return res.status(404).render('404', { requestedPath: req.originalUrl });
    }

    res.setHeader('Content-Type', 'application/pdf');
    return res.sendFile(filePath);
  } catch (error) {
    console.error('Error opening export:', error);
    return renderServerError(req, res, 'Failed to open export');
  }
});

app.get('/admin', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const users = await loadAdminUsers();
    const summary = buildAdminSummary(users);
    return res.render('admin', {
      users,
      summary,
      sectionOptions: VALID_SECTION_SLUGS,
      roles: VALID_ROLES,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Error loading admin panel:', error);
    return renderServerError(req, res, 'Failed to load admin panel');
  }
});

app.post('/admin/users', requireAuth, requireRole('super_admin'), async (req, res) => {
  const username = String(req.body.username || '').trim();
  const displayName = String(req.body.display_name || '').trim();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '').trim();
  const isActive = req.body.is_active === 'on' ? 1 : 0;
  const sections = normalizeSectionsInput(req.body.sections);

  if (!username || !displayName || !password || !VALID_ROLES.includes(role)) {
    return res.redirect('/admin?error=Invalid%20user%20input');
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [username, passwordHash, displayName, role, isActive]
    );

    await setUserSections(result.insertId, role, sections);
    return res.redirect('/admin?success=User%20created');
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.redirect('/admin?error=Username%20already%20exists');
    }
    console.error('Error creating user:', error);
    return renderServerError(req, res, 'Failed to create user');
  }
});

app.post('/admin/users/:id/update', requireAuth, requireRole('super_admin'), async (req, res) => {
  const userId = Number(req.params.id);
  const displayName = String(req.body.display_name || '').trim();
  const role = String(req.body.role || '').trim();
  const isActive = req.body.is_active === 'on' ? 1 : 0;
  const sections = normalizeSectionsInput(req.body.sections);

  if (!Number.isInteger(userId) || userId <= 0 || !displayName || !VALID_ROLES.includes(role)) {
    return res.redirect('/admin?error=Invalid%20update%20input');
  }

  try {
    const [result] = await pool.query(
      `UPDATE users
       SET display_name = ?, role = ?, is_active = ?
       WHERE id = ?`,
      [displayName, role, isActive, userId]
    );

    if (result.affectedRows === 0) {
      return res.redirect('/admin?error=User%20not%20found');
    }

    await setUserSections(userId, role, sections);

    if (req.session.user && req.session.user.id === userId) {
      const refreshed = await getUserWithSectionsById(userId);
      if (!refreshed || !refreshed.isActive) {
        return req.session.destroy(() => {
          res.redirect('/login?error=Account%20deactivated');
        });
      }

      req.session.user = {
        id: refreshed.id,
        username: refreshed.username,
        displayName: refreshed.displayName,
        role: refreshed.role,
        sections: refreshed.sections
      };
    }

    return res.redirect('/admin?success=User%20updated');
  } catch (error) {
    console.error('Error updating user:', error);
    return renderServerError(req, res, 'Failed to update user');
  }
});

app.get('/forbidden', requireAuth, (req, res) => renderForbidden(req, res));

app.use((req, res) => {
  return res.status(404).render('404', { requestedPath: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  return renderServerError(req, res);
});

// Existing /api/events routes should remain unchanged in production backend.
// This HW5 app focuses on authenticated reporting and analytics delivery.

app.listen(PORT, () => {
  console.log(`HW5 reporting platform listening on :${PORT}`);
});
