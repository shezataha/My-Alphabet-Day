-- My Alphabet Day — database setup
-- Run: C:\mariadb\bin\mysql.exe -u root < setup.sql
-- (or mysql -u root < setup.sql)

CREATE DATABASE IF NOT EXISTS alphabet_game
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'alphabet'@'localhost' IDENTIFIED BY 'Alphabet2026!';
CREATE USER IF NOT EXISTS 'alphabet'@'127.0.0.1' IDENTIFIED BY 'Alphabet2026!';
GRANT ALL PRIVILEGES ON alphabet_game.* TO 'alphabet'@'localhost';
GRANT ALL PRIVILEGES ON alphabet_game.* TO 'alphabet'@'127.0.0.1';
FLUSH PRIVILEGES;

USE alphabet_game;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(50)  NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  avatar_url     VARCHAR(16)  NOT NULL DEFAULT '🧸',
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Password resets table
CREATE TABLE IF NOT EXISTS password_resets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(120) NOT NULL,
  token      VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_token (token)
) ENGINE=InnoDB;

-- User favorites table
CREATE TABLE IF NOT EXISTS user_favorites (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  item_type  VARCHAR(30) NOT NULL,
  item_id    VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fav (user_id, item_type, item_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Progress table (per-user learning progress)
CREATE TABLE IF NOT EXISTS user_progress (
  user_id     INT PRIMARY KEY,
  stickers    TEXT NOT NULL,
  levels      TEXT NOT NULL,
  speech_on   TINYINT(1) NOT NULL DEFAULT 1,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;