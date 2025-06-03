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
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_ip          VARCHAR(45)    NOT NULL,
  interface_index    INT            NOT NULL,
  timestamp          DATETIME       NOT NULL,
  inbound_kbps       DECIMAL(10,2)  NOT NULL,
  outbound_kbps      DECIMAL(10,2)  NOT NULL,
  errors             INT            DEFAULT 0,
  INDEX (device_ip),
  INDEX (interface_index, timestamp)
);
