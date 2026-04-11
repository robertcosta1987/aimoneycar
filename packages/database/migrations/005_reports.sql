-- ── Relatórios Agendados ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relatorios_agendados (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN (
    'sales_overview', 'inventory_health', 'margin_analysis',
    'lead_funnel', 'expense_breakdown', 'salesperson_performance', 'monthly_comparison'
  )),
  frequencia    TEXT NOT NULL CHECK (frequencia IN ('daily', 'weekly', 'monthly')),
  dia_semana    INT,          -- 0=dom … 6=sab (weekly only)
  dia_mes       INT,          -- 1–28 (monthly only)
  hora          TEXT NOT NULL DEFAULT '08:00', -- HH:MM BRT
  destinatarios TEXT[] NOT NULL DEFAULT '{}',
  periodo_dias  INT NOT NULL DEFAULT 30,       -- data window for report data
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE relatorios_agendados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relatorios_agendados_dealership" ON relatorios_agendados
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

-- ── Log de Relatórios Enviados ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relatorios_enviados_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relatorio_id    UUID NOT NULL REFERENCES relatorios_agendados(id) ON DELETE CASCADE,
  dealership_id   UUID NOT NULL,
  enviado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  destinatarios   TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  erro            TEXT,
  resend_id       TEXT
);

ALTER TABLE relatorios_enviados_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relatorios_log_dealership" ON relatorios_enviados_log
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

-- ── Trigger: updated_at ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_relatorios_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_relatorios_updated_at
  BEFORE UPDATE ON relatorios_agendados
  FOR EACH ROW EXECUTE FUNCTION update_relatorios_updated_at();
