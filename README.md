# CSE 135 HW5 -- Analytics Platform Final

**Student:** Rick Rodness  
**Course:** UCSD CSE 135  
**Assignment:** Homework 5 Final Integration

## Overview

This project delivers a complete analytics platform built on top of the prior CSE 135 homework infrastructure.

The final system closes the loop between event collection, secure access control, polished analytics reporting, and exportable outputs.

Implemented outcomes:

- Database-backed authentication
- Role-based authorization with scoped analyst access
- Three polished report categories
- Viewer-safe saved report views
- Permission-aware PDF export flow
- Session Journey (Replay Lite) investigative view
- Super-admin user management
- Styled 403 / 404 / 500 handling

## Live Links

- **Reporting Login:** `https://reporting.rickrod.fit/login`
- **Collector Endpoint:** `https://collector.rickrod.fit/log`
- **Primary Domain:** `https://rickrod.fit`
- **Repository:** `https://github.com/rickrodness/cse135-hw5`

## Architecture / Stack

- Node.js + Express
- EJS server-rendered templates
- MySQL (analytics, users, scopes, export metadata)
- express-session for auth state
- bcryptjs for password hashing
- Chart.js for report charts
- Puppeteer for server-side PDF generation
- Nginx reverse proxy and HTTPS on DigitalOcean

## Key Project Files

- `app.js` - main Express app, auth, authorization, reports, export routes, admin routes
- `views/` - EJS templates for dashboard, reports, admin, and error pages
- `public/css/styles.css` - shared styling
- `db/schema.sql` - HW5 schema
- `db/seed.sql` - seeded demo users and initial data

## AI Usage Disclosure

AI tooling (GitHub Copilot / LLM assistance) was used during development as a support tool for:

- Drafting and refactoring boilerplate route/view code
- Reviewing role/permission flow for missed checks
- Speeding up repetitive query/view wiring

AI output was not accepted blindly. Final implementation, debugging, deployment, and verification decisions were manually reviewed and tested.

Observed value:

- Faster iteration on repetitive scaffolding
- Better coverage for edge-case brainstorming

Observed limitations:

- Suggested patterns can miss assignment-specific constraints
- Security and authorization assumptions must be manually validated
- Generated code quality varies and still requires human QA

## Authentication + Authorization

### Roles

- `super_admin`
  - Full platform access
  - Admin route access
  - All report/export access

- `analyst`
  - Access only assigned report sections
  - Export only assigned section reports
  - Saved report access for assigned sections

- `viewer`
  - Read-only saved report access
  - Saved report export access
  - No raw analyst report routes

### Analyst Scope Slugs

- `performance`
- `behavior`
- `platform_health`

Authorization is enforced on the server through middleware and route-level checks. UI visibility improves usability, but it is not the security boundary.

## Role-Aware Dashboard and Navigation

- Super admin sees admin controls and all report areas.
- Analyst sees only assigned report categories.
- Viewer sees only saved report paths with read-only framing.

## Report Categories

### 1. Performance Report

Focus:
- Average load time
- Slowest pages
- Load-time distribution and trend

Includes:
- KPI cards
- Multi-chart view
- Slow-page table
- Analyst commentary

### 2. User Behavior Report

Focus:
- Click, scroll, key, idle, leave signals
- Engagement concentration by page
- Session interaction patterns

Includes:
- KPI cards
- Interaction mix and page activity charts
- Page and session tables
- Analyst commentary

### 3. Platform / Client Health Report

Focus:
- Browser/network distribution
- Client capability signals
- Client-side error concentration

Includes:
- KPI cards
- Environment/error charts
- Recent error table
- Analyst commentary

## Saved Reports

Viewer-safe saved routes:

- `/reports/saved/performance-snapshot`
- `/reports/saved/behavior-snapshot`
- `/reports/saved/platform-health-snapshot`

These render curated read-only views while preserving role-based access control.

## Session Journey (Replay Lite)

Advanced behavior-analysis route:

- `GET /reports/session-journey`

What it provides:

- Session picker from recent high-activity sessions
- Ordered event timeline (time, event type, page, detail)
- Summary KPIs (events, unique pages, duration, click/scroll/idle/leave counts)

Access model:

- Super admin: full access
- Analyst: access only when scoped to `behavior`
- Viewer: no access

## PDF Export System

Exports are generated server-side from the shared report template in export mode.

Raw report export routes:

- `POST /reports/performance/export`
- `POST /reports/behavior/export`
- `POST /reports/platform-health/export`

Saved report export route:

- `POST /reports/saved/:slug/export`

Export files are recorded in `report_exports` and served through a permission-checked route:

- `GET /exports/:id`

This prevents unguarded direct file access from bypassing permissions.

## Super-Admin Management

Implemented admin flow:

- List users
- Create user (`username`, `display_name`, `password`, `role`, `active`)
- Update role and active state
- Assign analyst section scope

Scope normalization rules:

- Analyst users can have section scopes
- Viewer and super-admin scopes are cleared / ignored

## Error and Contingency Handling

- Styled 403 forbidden page
- Styled 404 not found page
- Styled 500 server error page
- Empty-state handling in report/table sections

## Local Run

Install dependencies:

```bash
npm install
```

Start server:

```bash
npm start
```

### Database Setup

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < db/schema.sql
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < db/seed.sql
```

Note: this repository's SQL files define the HW5 auth/scope/export tables (`users`, `user_sections`, `report_exports`). The analytics `events` table and collector pipeline are expected to come from prior homework infrastructure / deployed collector services.

### Environment Variables

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `SESSION_SECRET`

### Export Note

This project uses Puppeteer for server-side PDF generation. On some hosts, Chromium/runtime dependencies may need to be installed for PDF export to work correctly.

## Known Limitations / Tradeoffs

- No password reset/recovery workflow (out of scope)
- No admin audit log system (out of scope)
- Export history UI is minimal; metadata exists in the database
- Advanced filtering was intentionally limited to keep delivery stable
- PDF export favors reliable KPI/table/commentary output over fragile chart screenshot capture
- Session hardening settings are intentionally simple for class delivery and should be tightened for production-grade deployments

## Roadmap / Future Improvements

- Add richer date-range and segment filters
- Add export history management UI
- Add optional scheduled exports
- Add anomaly detection and alerting
- Add stronger automated role/permission test coverage