-- Expand cpap_logs with detailed event counts, pressure stats, breathing rate, and tidal volume
ALTER TABLE cpap_logs ADD COLUMN ai_count INTEGER;
ALTER TABLE cpap_logs ADD COLUMN hi_count INTEGER;
ALTER TABLE cpap_logs ADD COLUMN csa_count INTEGER;
ALTER TABLE cpap_logs ADD COLUMN snore_count INTEGER;
ALTER TABLE cpap_logs ADD COLUMN ai_total_duration_sec REAL;
ALTER TABLE cpap_logs ADD COLUMN hi_total_duration_sec REAL;
ALTER TABLE cpap_logs ADD COLUMN pressure_min REAL;
ALTER TABLE cpap_logs ADD COLUMN pressure_max REAL;
ALTER TABLE cpap_logs ADD COLUMN pressure_mean REAL;
ALTER TABLE cpap_logs ADD COLUMN pressure_median REAL;
ALTER TABLE cpap_logs ADD COLUMN pressure_p90 REAL;
ALTER TABLE cpap_logs ADD COLUMN pressure_p95 REAL;
ALTER TABLE cpap_logs ADD COLUMN br_mean REAL;
ALTER TABLE cpap_logs ADD COLUMN br_median REAL;
ALTER TABLE cpap_logs ADD COLUMN tv_mean REAL;
ALTER TABLE cpap_logs ADD COLUMN tv_median REAL;
