-- HW5 Phase 1 seed users.
-- Shared demo password for all accounts: cse135hw5

SET @pw_hash = '$2b$10$ghofoZHdVJ23tNXRL9oHcOz/jb1JArN3xrLpU0jY2G771JGeNpqcK';

INSERT INTO users (username, password_hash, display_name, role, is_active)
VALUES
  ('admin', @pw_hash, 'Super Admin', 'super_admin', 1),
  ('analyst_perf', @pw_hash, 'Performance Analyst', 'analyst', 1),
  ('analyst_multi', @pw_hash, 'Behavior + Performance Analyst', 'analyst', 1),
  ('viewer', @pw_hash, 'Report Viewer', 'viewer', 1),
  ('grader', @pw_hash, 'Grader', 'viewer', 1)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  display_name = VALUES(display_name),
  role = VALUES(role),
  is_active = VALUES(is_active);

-- Reset scoped access for seeded analysts to keep reruns deterministic.
DELETE us
FROM user_sections us
JOIN users u ON u.id = us.user_id
WHERE u.username IN ('analyst_perf', 'analyst_multi');

INSERT INTO user_sections (user_id, section_slug)
SELECT u.id, 'performance' FROM users u WHERE u.username = 'analyst_perf'
UNION ALL
SELECT u.id, 'performance' FROM users u WHERE u.username = 'analyst_multi'
UNION ALL
SELECT u.id, 'behavior' FROM users u WHERE u.username = 'analyst_multi';
