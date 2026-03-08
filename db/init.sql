-- Schema for UNIOSS
-- The database is created automatically by the Docker entrypoint using MYSQL_DATABASE

-- 2. Create Tables
-- devices table
CREATE TABLE `devices` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ip` VARCHAR(45) NOT NULL,
    `hostname` VARCHAR(191) DEFAULT NULL,
    `tower_name` VARCHAR(100) DEFAULT NULL,
    `description` TEXT DEFAULT NULL,
    `vendor` VARCHAR(50) DEFAULT NULL,
    `os_version` VARCHAR(50) DEFAULT NULL,
    `last_seen` DATETIME DEFAULT NULL,
    `status` ENUM('up','down') DEFAULT 'up',
    `snmp_community` VARCHAR(100) DEFAULT 'public',
    `poll_interval` INT DEFAULT 15,
    `offline_reason` VARCHAR(255) DEFAULT NULL,
    `sysdescr` TEXT,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_devices_ip` (`ip`),
    INDEX `idx_devices_ip` (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- device_interfaces
CREATE TABLE `device_interfaces` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `interface_index` INT NOT NULL,
  `name` VARCHAR(191) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_device_interface` (`device_id`, `interface_index`),
  INDEX `idx_device_id` (`device_id`),
  INDEX `idx_interface_index` (`interface_index`),
  CONSTRAINT `fk_device_interfaces_device`
    FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- performance metrics
CREATE TABLE `performance_metrics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_ip` VARCHAR(45) NOT NULL,
  `cpu_pct` DOUBLE NOT NULL DEFAULT 0,
  `memory_pct` DOUBLE NOT NULL DEFAULT 0,
  `uptime_seconds` BIGINT NOT NULL DEFAULT 0,
  `timestamp` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_perf_device_ts` (`device_ip`, `timestamp`),
  CONSTRAINT `fk_perf_device_ip`
    FOREIGN KEY (`device_ip`) REFERENCES `devices` (`ip`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- traffic metrics
CREATE TABLE `traffic_metrics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_ip` VARCHAR(45) NOT NULL,
  `interface_index` INT NOT NULL DEFAULT 0,
  `interface_name` VARCHAR(191) NOT NULL DEFAULT '',
  `inbound_kbps` DOUBLE NOT NULL DEFAULT 0,
  `outbound_kbps` DOUBLE NOT NULL DEFAULT 0,
  `in_errors` BIGINT NOT NULL DEFAULT 0,
  `out_errors` BIGINT NOT NULL DEFAULT 0,
  `errors` BIGINT NOT NULL DEFAULT 0,
  `timestamp` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  INDEX `idx_device_ts` (`device_ip`, `timestamp`),
  INDEX `idx_interface` (`interface_name`),
  INDEX `idx_device_interface` (`device_ip`, `interface_name`),
  CONSTRAINT `fk_traffic_device_ip`
    FOREIGN KEY (`device_ip`) REFERENCES `devices` (`ip`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- alerts
CREATE TABLE `alerts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_ip` VARCHAR(45) DEFAULT NULL,
  `severity` ENUM('info','warning','high','critical') NOT NULL DEFAULT 'info',
  `message` TEXT NOT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `acknowledged` TINYINT(1) NOT NULL DEFAULT 0,
  `category` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_alerts_device_ts` (`device_ip`, `timestamp`),
  INDEX `idx_alerts_ack` (`acknowledged`),
  CONSTRAINT `fk_alerts_device_ip`
    FOREIGN KEY (`device_ip`) REFERENCES `devices` (`ip`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- client_acl
CREATE TABLE `client_acl` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `mac_address` VARCHAR(64) NOT NULL,
    `device_ip` VARCHAR(45) NOT NULL,
    `auth_method` VARCHAR(50) DEFAULT 'manual',
    `status` ENUM('allowed', 'blocked') DEFAULT 'allowed',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_mac_device` (`mac_address`, `device_ip`),
    INDEX `idx_acl_device` (`device_ip`),
    CONSTRAINT `fk_client_acl_device`
        FOREIGN KEY (`device_ip`) REFERENCES `devices` (`ip`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- client_kickouts
CREATE TABLE `client_kickouts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `mac_address` VARCHAR(64) NOT NULL,
    `device_ip` VARCHAR(45) NOT NULL,
    `reason` VARCHAR(255) DEFAULT 'administrator kick',
    `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_kickouts_device` (`device_ip`),
    CONSTRAINT `fk_kickouts_device`
        FOREIGN KEY (`device_ip`) REFERENCES `devices` (`ip`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- access sessions
CREATE TABLE `access_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user` VARCHAR(128) NOT NULL,
  `ip` VARCHAR(45) NOT NULL,
  `mac` VARCHAR(64) DEFAULT NULL,
  `login_time` DATETIME NOT NULL,
  `logout_time` DATETIME DEFAULT NULL,
  `duration_seconds` INT DEFAULT NULL,
  `authenticated_via` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_access_ip` (`ip`),
  INDEX `idx_access_login` (`login_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- traffic_counters_last
CREATE TABLE `traffic_counters_last` (
  `device_ip` VARCHAR(45) NOT NULL,
  `interface_index` INT NOT NULL,
  `interface_name` VARCHAR(128) NOT NULL DEFAULT '',
  `last_in_octets` BIGINT NOT NULL DEFAULT 0,
  `last_out_octets` BIGINT NOT NULL DEFAULT 0,
  `last_in_errors` BIGINT NOT NULL DEFAULT 0,
  `last_out_errors` BIGINT NOT NULL DEFAULT 0,
  `last_seen` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(`device_ip`, `interface_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- signal_metrics
CREATE TABLE `signal_metrics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_ip` VARCHAR(45) NOT NULL,
  `interface_index` INT NOT NULL DEFAULT 0,
  `interface_name` VARCHAR(128) NOT NULL DEFAULT '',
  `rssi_dbm` DOUBLE NULL,
  `rssi_pct` DOUBLE NULL,
  `snr_db`         DOUBLE NULL,
  `tx_rate_mbps`   DOUBLE NULL,
  `rx_rate_mbps`   DOUBLE NULL,
  `link_quality_pct` DOUBLE NULL,
  `frequency_mhz` INT NULL,
  `raw_blob` JSON NULL,
  `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_signal_device_ts (device_ip, timestamp),
  KEY idx_signal_device_iface (device_ip, interface_index),
  CONSTRAINT `fk_signal_device_ip`
    FOREIGN KEY (`device_ip`) REFERENCES `devices` (`ip`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- signal_thresholds (referenced by poller logs)
CREATE TABLE IF NOT EXISTS `signal_thresholds` (
  `device_ip` VARCHAR(45) NOT NULL,
  `interface_index` INT NOT NULL,
  `warn_dbm` DOUBLE DEFAULT NULL,
  `high_dbm` DOUBLE DEFAULT NULL,
  `critical_dbm` DOUBLE DEFAULT NULL,
  `computed_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`device_ip`, `interface_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. Seed Data
-- 1️⃣ DEVICES
INSERT INTO devices (ip, hostname, tower_name, description) VALUES
('10.0.1.5', 'Tower 1', 'Tower 1', 'Sector antenna a'),
('10.0.2.5', 'Tower 2', 'Tower 2', 'Sector antenna b'),
('10.0.3.5', 'Tower 3', 'Tower 3', 'Sector antenna c'),
('10.0.1.11', 'Device 1-1', 'Tower 1', 'Connected to Tower 1'),
('10.0.1.12', 'Device 1-2', 'Tower 1', 'Connected to Tower 1'),
('10.0.1.13', 'Device 1-3', 'Tower 1', 'Connected to Tower 1'),
('10.0.1.14', 'Device 1-4', 'Tower 1', 'Connected to Tower 1'),
('10.0.1.15', 'Device 1-5', 'Tower 1', 'Connected to Tower 1'),
('10.0.2.11', 'Boros-ubnt', 'Tower 2', 'Connected to Tower 2'),
('10.0.2.12', 'SIlas-Ubnt', 'Tower 2', 'Connected to Tower 2'),
('10.0.2.13', 'George', 'Tower 2', 'Connected to Tower 2'),
('10.0.2.14', 'mikrotik', 'Tower 2', 'Connected to Tower 2'),
('10.0.2.15', 'mktk', 'Tower 2', 'Connected to Tower 2'),
('10.0.2.16', 'cisco', 'Tower 2', 'Connected to Tower 2'),
('10.0.3.11', 'Rimon-cisco', 'Tower 3', 'Connected to Tower 3'),
('10.0.3.12', 'ubnt-bakery', 'Tower 3', 'Connected to Tower 3'),
('10.0.3.13', 'Alphagrdn-cisco', 'Tower 3', 'Connected to Tower 3'),
('10.0.3.14', 'ubntt', 'Tower 3', 'Connected to Tower 3'),
('10.0.3.15', 'ubnt-DIana', 'Tower 3', 'Connected to Tower 3'),
('10.0.3.16', 'nina', 'Tower 3', 'Connected to Tower 3'),
('10.0.3.17', 'dave-cisco', 'Tower 3', 'Connected to Tower 3');

-- 2️⃣ PERFORMANCE METRICS (initial snapshot)
INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
SELECT ip, ROUND(10 + (RAND() * 50),1), ROUND(20 + (RAND() * 50),1), FLOOR(1000 + (RAND() * 99000)), NOW()
FROM devices;

-- 3️⃣ TRAFFIC METRICS (initial snapshot)
INSERT INTO traffic_metrics (device_ip, interface_index, interface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp)
SELECT ip, 1, 'eth0', ROUND(RAND() * 1000,2), ROUND(RAND() * 1000,2), FLOOR(RAND() * 5), FLOOR(RAND() * 5), FLOOR(RAND() * 10), NOW()
FROM devices;

-- 4️⃣ ACCESS SESSIONS
INSERT INTO access_sessions (user, ip, mac, login_time, logout_time, duration_seconds, authenticated_via)
SELECT CONCAT('user', FLOOR(1 + (RAND()*10))), ip, CONCAT('00:1A:C2:', LPAD(FLOOR(RAND()*99),2,'0'), ':', LPAD(FLOOR(RAND()*99),2,'0'), ':', LPAD(FLOOR(RAND()*99),2,'0')),
       NOW() - INTERVAL FLOOR(RAND()*3600) SECOND, NOW() - INTERVAL FLOOR(RAND()*1800) SECOND, FLOOR(RAND()*1800), 'snmp'
FROM devices LIMIT 20;

-- 5️⃣ ALERTS
INSERT INTO alerts (device_ip, severity, message, timestamp, acknowledged, category)
SELECT ip, ELT(FLOOR(1 + RAND()*3), 'info', 'warning', 'critical'), CONCAT('Alert for ', hostname), NOW() - INTERVAL FLOOR(RAND()*86400) SECOND, 0, 'system'
FROM devices LIMIT 10;

-- 6️⃣ DATA RETENTION EVENT SCHEDULER
SET GLOBAL event_scheduler = ON;

DELIMITER $$
CREATE EVENT IF NOT EXISTS cleanup_old_metrics
ON SCHEDULE EVERY 1 DAY
DO BEGIN
  DELETE FROM performance_metrics WHERE timestamp < NOW() - INTERVAL 30 DAY;
  DELETE FROM traffic_metrics WHERE timestamp < NOW() - INTERVAL 30 DAY;
  DELETE FROM signal_metrics WHERE timestamp < NOW() - INTERVAL 30 DAY;
  DELETE FROM alerts WHERE timestamp < NOW() - INTERVAL 90 DAY;
END$$
DELIMITER ;
