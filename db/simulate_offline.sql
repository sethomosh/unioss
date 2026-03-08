-- db/simulate_offline.sql
USE `unioss`;

-- 1️⃣ Offline Tower (Tower 4)
INSERT INTO devices (ip, hostname, description, status) VALUES
('10.0.4.5', 'Tower 4 (Offline)', 'Main offline tower simulation', 'down');

-- 2️⃣ Child devices for Tower 4 (all offline)
INSERT INTO devices (ip, hostname, description, status) VALUES
('10.0.4.11', 'Device 4-1', 'Offline child of Tower 4', 'down'),
('10.0.4.12', 'Device 4-2', 'Offline child of Tower 4', 'down'),
('10.0.4.13', 'Device 4-3', 'Offline child of Tower 4', 'down'),
('10.0.4.14', 'Device 4-4', 'Offline child of Tower 4', 'down'),
('10.0.4.15', 'Device 4-5', 'Offline child of Tower 4', 'down');

-- 3️⃣ Scattered offline devices for Tower 1, 2, 3
INSERT INTO devices (ip, hostname, description, status) VALUES
('10.0.1.20', 'Offline 1-X', 'Random offline device on Tower 1', 'down'),
('10.0.2.20', 'Offline 2-X', 'Random offline device on Tower 2', 'down'),
('10.0.3.20', 'Offline 3-X', 'Random offline device on Tower 3', 'down');

-- 4️⃣ Add some historical (down) metrics for these devices so they are not empty
INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
SELECT ip, 0, 0, 0, NOW() - INTERVAL 1 HOUR
FROM devices WHERE status = 'down';

INSERT INTO traffic_metrics (device_ip, interface_index, interface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp)
SELECT ip, 1, 'eth0', 0, 0, 0, 0, 0, NOW() - INTERVAL 1 HOUR
FROM devices WHERE status = 'down';
