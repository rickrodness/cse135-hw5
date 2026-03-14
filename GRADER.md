# GRADER.md - CSE 135 HW5

This file provides the fastest path to evaluate my HW5 functionality.

## Primary Grading URL

- **Login URL:** `https://reporting.rickrod.fit/login`

## Credentials

Use these seeded accounts.

Role mapping for assignment wording:

- `super admin` -> `super_admin`
- `admin` (if interpreted separately in wording) -> handled by `super_admin` in this project
- `reporter` -> `analyst`
- read-only consumer -> `viewer`

If unchanged from the provided seed file:

- **Super Admin**
  - Username: `admin`
  - Password: `cse135hw5`

- **Analyst (Performance only)**
  - Username: `analyst_perf`
  - Password: `cse135hw5`

- **Analyst (Performance + Behavior)**
  - Username: `analyst_multi`
  - Password: `cse135hw5`

- **Viewer**
  - Username: `viewer`
  - Password: `cse135hw5`

If these were changed locally or on deployment, replace them here before submission.

## What Each Account Demonstrates

- **Super Admin**
  - Full access to all report categories
  - Access to admin management route
  - Can create/update users and section scopes
  - Can export all report categories
  - Can access Session Journey (Replay Lite)

- **Analyst (Performance only)**
  - Access to `/reports/performance`
  - Forbidden on `/reports/behavior` and `/reports/platform-health`
  - Can export only permitted report routes

- **Analyst (Performance + Behavior)**
  - Access to `/reports/performance` and `/reports/behavior`
  - Forbidden on `/reports/platform-health` unless scoped

- **Viewer**
  - Access to saved report routes only
  - Can export saved reports
  - Forbidden on raw analyst report routes and admin route

## Recommended 5-Minute Demo Flow

### 1. Super Admin Login

Log in as:

- Username: `admin`
- Password: `cse135hw5`

Then open:

- `/admin`

Expected result:

- User list visible
- Create-user form visible
- Role, active status, and analyst scope controls visible

### 2. Super Admin Report + Export

Still as super admin, open:

- `/reports/performance`

Expected result:

- Performance report loads
- KPI cards, charts, commentary, and table are visible

Then click:

- **Export PDF**

Expected result:

- Export succeeds
- PDF opens through `/exports/:id`

### 2b. Super Admin Session Journey (Extra Credit)

Still as super admin, open:

- `/reports/session-journey`

Expected result:

- Session selector is visible
- Timeline table shows ordered behavior events for a selected session
- Summary cards show event counts, unique pages, duration, and interaction mix

### 3. Analyst Scoped Access

Log out, then log in as:

- Username: `analyst_perf`
- Password: `cse135hw5`

Open:

- `/reports/performance`

Expected result:

- Allowed

Then open:

- `/reports/behavior`

Expected result:

- Styled 403 page

Then open:

- `/reports/session-journey`

Expected result:

- Allowed only if analyst has `behavior` scope
- Otherwise styled 403 page

### 4. Viewer Read-Only Access

Log out, then log in as:

- Username: `viewer`
- Password: `cse135hw5`

Open:

- `/reports/saved/performance-snapshot`

Expected result:

- Saved report loads successfully

Then export it.

Expected result:

- Saved-report export succeeds

Then open:

- `/reports/performance`

Expected result:

- Styled 403 page

This demonstrates roles, scope enforcement, polished reports, and export flow quickly.

## Areas Of Concern (Accountability / Leniency)

Most likely risk areas that may still contain defects:

- Role/scope edge cases on direct URL access rather than nav-only access
- Performance on larger event datasets due to JSON extraction queries
- PDF export dependency on Puppeteer/Chromium runtime packages on the deployed host
- Export access control correctness when multiple roles generate many files over time

Architecture tradeoffs acknowledged:

- Focus was placed on reliable RBAC/reporting flow over advanced filters and audit subsystems
- Export history UX is intentionally minimal while export metadata is persisted server-side
- Password reset/recovery and admin audit trail are out of scope for this assignment window

## Route Protection Expectations

- Logged-out access to protected routes redirects to `/login`.
  - Expected result: Redirect to login page.
- Authenticated unauthorized access renders styled `403`.
  - Expected result: Styled forbidden page.
- Unknown routes render styled `404`.
  - Expected result: Styled not found page.

## PDF Export Verification

- Export button appears on report pages.
  - Expected result: Button is visible on report view pages.
- Export creates a PDF and returns a guarded `/exports/:id` path.
  - Expected result: PDF opens in browser and file is permission-checked.
- Exported PDF includes:
  - report title
  - generated timestamp
  - KPI cards
  - commentary
  - table content

## Known Limitations / Tradeoffs

- No password reset flow (intentionally out of scope)
- No admin action audit log
- Export history UI is minimal
- Advanced filters are intentionally lightweight for stability and time constraints

## Troubleshooting Notes

- Confirm DB env vars are correct.
- Confirm `db/schema.sql` and `db/seed.sql` were applied.
- Confirm credentials in this file match actual seeded values.
- Confirm Puppeteer is installed on runtime host for PDF export.

## Final Submission Checklist

- Replace all `<FILL_...>` placeholders.
- Verify live URLs.
- Verify repo URL.
- Verify seeded credentials still match deployment.
- Test export once on the live server.
- Test `/admin` as admin.
- Test `/reports/behavior` as `analyst_perf` and confirm 403.
- Test `/reports/saved/performance-snapshot` as viewer.
- Confirm both `README.md` and `GRADER.md` are present in the repository root for turn-in.
