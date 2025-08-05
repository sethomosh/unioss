-- db/init.sql

CREATE DATABASE IF NOT EXISTS unios CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE unios;

-- Table: devices
CREATE TABLE IF NOT EXISTS devices (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  ip             VARCHAR(45)    NOT NULL UNIQUE,
  hostname       VARCHAR(255),
  description    TEXT,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO devices (ip, hostname, description) VALUES
  ('192.168.1.10', 'tower-10', 'Test tower #10'),
  ('192.168.1.11', 'tower-11', 'Test tower #11');

-- Table: device_interfaces
CREATE TABLE IF NOT EXISTS device_interfaces (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  device_id          INT            NOT NULL,
  interface_index    INT            NOT NULL,
  name               VARCHAR(128),
  created_at         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE CASCADE
);

INSERT INTO device_interfaces (device_id, interface_index, name)
VALUES
  (1, 1, 'eth0'),
  (1, 2, 'eth1'),
  (2, 1, 'eth0'),
  (2, 2, 'eth1');

-- Table: performance_metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_ip     VARCHAR(45)     NOT NULL,
  timestamp     DATETIME        NOT NULL,
  cpu_pct       DECIMAL(5,2)    NOT NULL,
  memory_pct    DECIMAL(5,2)    NOT NULL,
  uptime_secs   BIGINT          NOT NULL,
  INDEX (device_ip),
  INDEX (timestamp)
);

-- Table: traffic_metrics
CREATE TABLE IF NOT EXISTS traffic_metrics (
  device_ip        VARCHAR(45)   NOT NULL,
  interface_index  INT           NOT NULL,
  iface_name       VARCHAR(128)  NOT NULL DEFAULT '',
  inbound_kbps     DOUBLE        NOT NULL,
  outbound_kbps    DOUBLE        NOT NULL,
  in_errors        INT           NOT NULL DEFAULT 0,
  out_errors       INT           NOT NULL DEFAULT 0,
  errors           INT           NOT NULL DEFAULT 0,
  timestamp        DATETIME(6)   NOT NULL,
  PRIMARY KEY(device_ip, interface_index, timestamp)
);

-- Table: access_sessions
CREATE TABLE IF NOT EXISTS access_sessions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user              VARCHAR(100) NOT NULL,
  ip                VARCHAR(45)  NOT NULL,
  mac               VARCHAR(17)  NOT NULL,
  login_time        DATETIME     NOT NULL,
  logout_time       DATETIME     DEFAULT NULL,
  duration_seconds  INT          DEFAULT NULL,
  authenticated_via VARCHAR(50)  NOT NULL,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- (Optional) Insert a couple of sample rows so you see data right away:
INSERT IGNORE INTO access_sessions 
  (user, ip, mac, login_time, logout_time, duration_seconds, authenticated_via)
VALUES
  ('alice', '192.168.1.10', 'AA:BB:CC:01:02:03', '2025-05-08 16:00:00', NULL,   NULL,     'snmp'),
  ('bob',   '192.168.1.11', 'AA:BB:CC:01:02:04', '2025-05-08 15:30:00', '2025-05-08 16:00:00', 1800, 'database');


-- Persist last‐seen SNMP octet counters to compute deltas
CREATE TABLE IF NOT EXISTS traffic_counters_last (
  device_ip        VARCHAR(45)   NOT NULL,
  interface_index  INT           NOT NULL,
  iface_name       VARCHAR(128)  NOT NULL DEFAULT '',
  last_in_octets   BIGINT        NOT NULL DEFAULT 0,
  last_out_octets  BIGINT        NOT NULL DEFAULT 0,
  last_in_errors   INT           NOT NULL DEFAULT 0,
  last_out_errors  INT           NOT NULL DEFAULT 0,
  last_seen        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(device_ip, interface_index)
);
