-- devices.sql: create devices + device_interfaces and seed rows (idempotent)

CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL UNIQUE,
  hostname VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_interfaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  interface_index INT NOT NULL,
  name VARCHAR(128),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Insert the two devices (INSERT IGNORE makes it idempotent)
INSERT IGNORE INTO devices (ip, hostname, description) VALUES
  ('192.168.1.10', 'tower-10', 'Test tower #10'),
  ('192.168.1.11', 'tower-11', 'Test tower #11');

-- Ensure eth0/eth1 interfaces exist for those devices (idempotent)
INSERT INTO device_interfaces (device_id, interface_index, name)
SELECT d.id, vals.idx, vals.name
FROM devices d
CROSS JOIN (SELECT 1 AS idx,'eth0' AS name UNION ALL SELECT 2,'eth1') vals
WHERE d.ip IN ('192.168.1.10','192.168.1.11')
  AND NOT EXISTS (
     SELECT 1 FROM device_interfaces di WHERE di.device_id = d.id AND di.interface_index = vals.idx
  );
