-- HW5 Phase 1 schema: users + scoped analyst access + export metadata.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role ENUM('super_admin', 'analyst', 'viewer') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  section_slug ENUM('performance', 'behavior', 'platform_health') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_sections_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_user_section UNIQUE (user_id, section_slug)
);

CREATE TABLE IF NOT EXISTS report_exports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_slug VARCHAR(100) NOT NULL,
  generated_by_user_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  filters_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_exports_user FOREIGN KEY (generated_by_user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_report_slug (report_slug),
  INDEX idx_exports_created (created_at)
);
