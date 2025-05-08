-- db/init.sql

CREATE DATABASE IF NOT EXISTS unios CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE unios;

-- Table: devices
CREATE TABLE IF NOT EXISTS devices (
  ip VARCHAR(45) NOT NULL PRIMARY KEY,
  hostname VARCHAR(255),
  description TEXT
);

INSERT IGNORE INTO devices (ip, hostname, description) VALUES
  ('192.168.1.10', 'tower-10', 'Test tower #10'),
  ('192.168.1.11', 'tower-11', 'Test tower #11');

-- Table: device_interfaces
CREATE TABLE IF NOT EXISTS device_interfaces (
  ip VARCHAR(45) NOT NULL,
  interface_index INT NOT NULL,
  PRIMARY KEY (ip, interface_index),
  FOREIGN KEY (ip) REFERENCES devices(ip) ON DELETE CASCADE
);

INSERT IGNORE INTO device_interfaces (ip, interface_index) VALUES
  ('192.168.1.10', 1),
  ('192.168.1.10', 2),
  ('192.168.1.11', 1);
