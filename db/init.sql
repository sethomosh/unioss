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
