-- =============================================================================
-- Migration 006: Executive Reports System
-- =============================================================================
-- Creates two tables:
--   executive_reports       → stores generated report documents (JSON payload)
--   executive_report_schedules → per-dealership email delivery configuration
-- =============================================================================

-- ─── executive_reports ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS executive_reports (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dealership_id   uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('weekly', 'monthly', 'quarterly', 'annual')),
  period_label    text NOT NULL,            -- e.g. "March 2026"
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  data            jsonb NOT NULL DEFAULT '{}', -- full computed report payload
  generated_at    timestamptz DEFAULT now(),
  triggered_by    text NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'scheduled')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS executive_reports_dealership_idx
  ON executive_reports (dealership_id, generated_at DESC);

-- ─── executive_report_schedules ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS executive_report_schedules (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dealership_id      uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  enabled            boolean NOT NULL DEFAULT false,
  recipient_emails   text[]  NOT NULL DEFAULT '{}',
  report_types       text[]  NOT NULL DEFAULT '{}',  -- e.g. ['monthly','weekly']
  delivery_config    jsonb   NOT NULL DEFAULT '{}',  -- { weekly:{day:1}, monthly:{day:1}, ... }
  include_attachment boolean NOT NULL DEFAULT true,
  email_subject      text    NOT NULL DEFAULT 'Relatório Executivo — {dealership_name} | {period}',
  email_body         text    NOT NULL DEFAULT '',
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (dealership_id)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE executive_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_report_schedules   ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write their own dealership data
CREATE POLICY "executive_reports_dealership" ON executive_reports
  FOR ALL USING (
    dealership_id IN (
      SELECT dealership_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "executive_report_schedules_dealership" ON executive_report_schedules
  FOR ALL USING (
    dealership_id IN (
      SELECT dealership_id FROM users WHERE id = auth.uid()
    )
  );
