ALTER TABLE traffic_counters_last
  ADD COLUMN last_in_octets  BIGINT        NOT NULL DEFAULT 0,
  ADD COLUMN last_out_octets BIGINT        NOT NULL DEFAULT 0,
  ADD COLUMN last_in_errors  INT           NOT NULL DEFAULT 0,
  ADD COLUMN last_out_errors INT           NOT NULL DEFAULT 0,
  ADD COLUMN last_seen       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP;
