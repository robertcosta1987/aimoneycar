-- Fix get_calendario_dashboard: type mismatch between RETURNS TABLE (VARCHAR)
-- and actual column types from employees.name (TEXT) and CASE expressions (TEXT).
-- Casting to TEXT throughout to avoid "Returned type text does not match expected
-- type character varying" errors in PostgreSQL set-returning functions.

CREATE OR REPLACE FUNCTION get_calendario_dashboard(
  p_dealership_id UUID,
  p_data_inicio DATE,
  p_data_fim DATE,
  p_salesperson_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  data_inicio TIMESTAMPTZ,
  data_fim TIMESTAMPTZ,
  lead_nome TEXT,
  lead_telefone TEXT,
  tipo TEXT,
  veiculo_interesse TEXT,
  status TEXT,
  salesperson_id UUID,
  salesperson_name TEXT,
  cor TEXT,
  origem TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.data_inicio,
    a.data_fim,
    a.lead_nome::TEXT,
    a.lead_telefone::TEXT,
    a.tipo::TEXT,
    COALESCE(v.brand || ' ' || v.model || ' ' || v.year_model::TEXT, a.veiculo_interesse)::TEXT AS veiculo_interesse,
    a.status::TEXT,
    a.salesperson_id,
    e.name::TEXT AS salesperson_name,
    CASE a.status
      WHEN 'agendado'       THEN '#3B82F6'
      WHEN 'confirmado'     THEN '#10B981'
      WHEN 'em_atendimento' THEN '#F59E0B'
      WHEN 'concluido'      THEN '#6B7280'
      WHEN 'cancelado'      THEN '#EF4444'
      WHEN 'no_show'        THEN '#DC2626'
      ELSE '#00D9FF'
    END::TEXT AS cor,
    a.origem::TEXT
  FROM agendamentos a
  LEFT JOIN vehicles v ON a.vehicle_id = v.id
  LEFT JOIN employees e ON a.salesperson_id = e.id
  WHERE a.dealership_id = p_dealership_id
    AND (p_salesperson_id IS NULL OR a.salesperson_id = p_salesperson_id)
    AND a.data_inicio >= p_data_inicio::TIMESTAMPTZ
    AND a.data_inicio < (p_data_fim + 1)::TIMESTAMPTZ
  ORDER BY a.data_inicio;
END;
$$ LANGUAGE plpgsql;
