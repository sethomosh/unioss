ALTER TABLE traffic_counters_last
  ADD COLUMN iface_name    VARCHAR(128)  NOT NULL DEFAULT '',
  ADD COLUMN in_errors     INT           NOT NULL DEFAULT 0,
  ADD COLUMN out_errors    INT           NOT NULL DEFAULT 0;

ALTER TABLE traffic_metrics
  ADD COLUMN iface_name    VARCHAR(128)  NOT NULL DEFAULT '',
  ADD COLUMN in_errors     INT           NOT NULL DEFAULT 0,
  ADD COLUMN out_errors    INT           NOT NULL DEFAULT 0;
