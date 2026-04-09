-- ============================================================================
-- CALENDAR SYSTEM
-- Adapted to use existing English table names: employees, vehicles, dealerships
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Business hours per dealership
CREATE TABLE IF NOT EXISTS horarios_funcionamento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ... 6=Saturday
  aberto BOOLEAN DEFAULT TRUE,
  hora_abertura TIME,
  hora_fechamento TIME,
  almoco_inicio TIME,
  almoco_fim TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dealership_id, dia_semana)
);

-- Seed default business hours for a dealership
CREATE OR REPLACE FUNCTION seed_horarios_funcionamento(p_dealership_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO horarios_funcionamento (dealership_id, dia_semana, aberto, hora_abertura, hora_fechamento, almoco_inicio, almoco_fim)
  VALUES
    (p_dealership_id, 0, FALSE, NULL, NULL, NULL, NULL),
    (p_dealership_id, 1, TRUE, '08:00', '18:00', '12:00', '13:00'),
    (p_dealership_id, 2, TRUE, '08:00', '18:00', '12:00', '13:00'),
    (p_dealership_id, 3, TRUE, '08:00', '18:00', '12:00', '13:00'),
    (p_dealership_id, 4, TRUE, '08:00', '18:00', '12:00', '13:00'),
    (p_dealership_id, 5, TRUE, '08:00', '18:00', '12:00', '13:00'),
    (p_dealership_id, 6, TRUE, '08:00', '13:00', NULL, NULL)
  ON CONFLICT (dealership_id, dia_semana) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Blocked time slots (holidays, vacations, meetings)
CREATE TABLE IF NOT EXISTS slots_bloqueados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE, -- NULL = blocks all salespeople
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ NOT NULL,
  motivo VARCHAR(255),
  tipo VARCHAR(50) DEFAULT 'manual', -- manual, feriado, ferias, reuniao
  recorrente BOOLEAN DEFAULT FALSE,
  recorrencia_regra JSONB,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_overlap_blocks EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(data_inicio, data_fim) WITH &&
  ) WHERE (employee_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_slots_bloqueados_range ON slots_bloqueados
  USING gist (tstzrange(data_inicio, data_fim));
CREATE INDEX IF NOT EXISTS idx_slots_bloqueados_dealership ON slots_bloqueados(dealership_id);

-- Main appointments table
CREATE TABLE IF NOT EXISTS agendamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ NOT NULL,
  lead_nome VARCHAR(255) NOT NULL,
  lead_telefone VARCHAR(20),
  lead_email VARCHAR(255),
  lead_cpf VARCHAR(14),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  veiculo_interesse TEXT,
  tipo VARCHAR(50) DEFAULT 'visita', -- visita, test_drive, avaliacao_troca, entrega
  salesperson_id UUID REFERENCES employees(id),
  status VARCHAR(20) DEFAULT 'agendado',
  -- agendado -> confirmado -> em_atendimento -> concluido | cancelado | no_show
  dados_qualificacao JSONB DEFAULT '{}',
  origem VARCHAR(50) DEFAULT 'widget', -- widget, whatsapp, telefone, loja, manual
  conversa_id UUID,
  google_event_id VARCHAR(255),
  outlook_event_id VARCHAR(255),
  ical_uid VARCHAR(255),
  lembrete_24h_enviado BOOLEAN DEFAULT FALSE,
  lembrete_1h_enviado BOOLEAN DEFAULT FALSE,
  confirmacao_enviada BOOLEAN DEFAULT FALSE,
  observacoes TEXT,
  observacoes_internas TEXT,
  resultado VARCHAR(50),
  resultado_notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    salesperson_id WITH =,
    tstzrange(data_inicio, data_fim) WITH &&
  ) WHERE (status NOT IN ('cancelado'))
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_slot ON agendamentos (dealership_id, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_agendamentos_salesperson ON agendamentos (salesperson_id, data_inicio);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos (status) WHERE status NOT IN ('cancelado', 'concluido');
CREATE INDEX IF NOT EXISTS idx_agendamentos_dealership ON agendamentos (dealership_id, status);

-- Calendar configuration per dealership
CREATE TABLE IF NOT EXISTS calendario_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE UNIQUE,
  duracao_padrao_minutos INTEGER DEFAULT 30,
  intervalo_entre_slots INTEGER DEFAULT 0,
  antecedencia_minima_horas INTEGER DEFAULT 2,
  antecedencia_maxima_dias INTEGER DEFAULT 30,
  max_agendamentos_por_slot INTEGER DEFAULT 1,
  distribuicao_automatica BOOLEAN DEFAULT TRUE,
  metodo_distribuicao VARCHAR(50) DEFAULT 'round_robin',
  ultimo_salesperson_id UUID REFERENCES employees(id),
  notificar_whatsapp BOOLEAN DEFAULT TRUE,
  notificar_email BOOLEAN DEFAULT FALSE,
  lembrete_24h BOOLEAN DEFAULT TRUE,
  lembrete_1h BOOLEAN DEFAULT TRUE,
  widget_ativo BOOLEAN DEFAULT TRUE,
  widget_cor VARCHAR(7) DEFAULT '#00D9FF',
  widget_posicao VARCHAR(20) DEFAULT 'bottom-right',
  widget_mensagem_inicial TEXT DEFAULT 'Olá! Posso ajudar a encontrar seu próximo carro? 🚗',
  widget_avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Widget conversations
CREATE TABLE IF NOT EXISTS widget_conversas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE,
  visitor_id VARCHAR(100),
  lead_nome VARCHAR(255),
  lead_telefone VARCHAR(20),
  lead_email VARCHAR(255),
  mensagens JSONB DEFAULT '[]',
  qualificado BOOLEAN DEFAULT FALSE,
  dados_qualificacao JSONB DEFAULT '{}',
  temperatura VARCHAR(20),
  agendamento_id UUID REFERENCES agendamentos(id),
  convertido BOOLEAN DEFAULT FALSE,
  pagina_origem TEXT,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  dispositivo VARCHAR(50),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widget_conversas_dealership ON widget_conversas(dealership_id);
CREATE INDEX IF NOT EXISTS idx_widget_conversas_convertido ON widget_conversas(dealership_id, convertido);

-- Personal calendar integrations per salesperson
CREATE TABLE IF NOT EXISTS calendario_integracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL, -- google, outlook, apple
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  calendar_id VARCHAR(255) DEFAULT 'primary',
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_direction VARCHAR(20) DEFAULT 'push',
  last_sync TIMESTAMPTZ,
  sync_errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, provider)
);

-- ============================================================================
-- CALENDAR FUNCTIONS
-- ============================================================================

-- Check if a specific slot is available for a salesperson
CREATE OR REPLACE FUNCTION check_slot_disponivel(
  p_dealership_id UUID,
  p_salesperson_id UUID,
  p_data_inicio TIMESTAMPTZ,
  p_data_fim TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
  v_dia_semana INTEGER;
  v_hora_inicio TIME;
  v_hora_fim TIME;
  v_horario horarios_funcionamento%ROWTYPE;
  v_conflito_count INTEGER;
  v_config calendario_config%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_config FROM calendario_config WHERE dealership_id = p_dealership_id;

  IF v_config.antecedencia_minima_horas IS NOT NULL THEN
    IF p_data_inicio < v_now + (v_config.antecedencia_minima_horas || ' hours')::INTERVAL THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF v_config.antecedencia_maxima_dias IS NOT NULL THEN
    IF p_data_inicio > v_now + (v_config.antecedencia_maxima_dias || ' days')::INTERVAL THEN
      RETURN FALSE;
    END IF;
  END IF;

  v_dia_semana := EXTRACT(DOW FROM p_data_inicio AT TIME ZONE 'America/Sao_Paulo');
  v_hora_inicio := (p_data_inicio AT TIME ZONE 'America/Sao_Paulo')::TIME;
  v_hora_fim := (p_data_fim AT TIME ZONE 'America/Sao_Paulo')::TIME;

  SELECT * INTO v_horario
  FROM horarios_funcionamento
  WHERE dealership_id = p_dealership_id AND dia_semana = v_dia_semana;

  IF NOT FOUND OR NOT v_horario.aberto THEN
    RETURN FALSE;
  END IF;

  IF v_hora_inicio < v_horario.hora_abertura OR v_hora_fim > v_horario.hora_fechamento THEN
    RETURN FALSE;
  END IF;

  IF v_horario.almoco_inicio IS NOT NULL AND v_horario.almoco_fim IS NOT NULL THEN
    IF (v_hora_inicio >= v_horario.almoco_inicio AND v_hora_inicio < v_horario.almoco_fim)
       OR (v_hora_fim > v_horario.almoco_inicio AND v_hora_fim <= v_horario.almoco_fim)
       OR (v_hora_inicio <= v_horario.almoco_inicio AND v_hora_fim >= v_horario.almoco_fim) THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_conflito_count
  FROM slots_bloqueados
  WHERE dealership_id = p_dealership_id
    AND (employee_id IS NULL OR employee_id = p_salesperson_id)
    AND tstzrange(data_inicio, data_fim) && tstzrange(p_data_inicio, p_data_fim);

  IF v_conflito_count > 0 THEN
    RETURN FALSE;
  END IF;

  IF p_salesperson_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflito_count
    FROM agendamentos
    WHERE salesperson_id = p_salesperson_id
      AND status NOT IN ('cancelado')
      AND tstzrange(data_inicio, data_fim) && tstzrange(p_data_inicio, p_data_fim);

    IF v_conflito_count > 0 THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Get all available slots for a date range
CREATE OR REPLACE FUNCTION get_slots_disponiveis(
  p_dealership_id UUID,
  p_data_inicio DATE,
  p_data_fim DATE,
  p_salesperson_id UUID DEFAULT NULL
)
RETURNS TABLE (
  data DATE,
  dia_semana INTEGER,
  dia_nome VARCHAR,
  horario TIME,
  horario_fim TIME,
  disponivel BOOLEAN,
  salespersons_disponiveis UUID[]
) AS $$
DECLARE
  v_current_date DATE;
  v_dia_semana INTEGER;
  v_horario horarios_funcionamento%ROWTYPE;
  v_current_time TIME;
  v_slot_end TIME;
  v_config calendario_config%ROWTYPE;
  v_salespersons UUID[];
  v_salesperson UUID;
  v_slot_inicio TIMESTAMPTZ;
  v_slot_fim TIMESTAMPTZ;
  v_duracao INTEGER;
  v_intervalo INTEGER;
  v_available UUID[];
BEGIN
  SELECT * INTO v_config FROM calendario_config WHERE dealership_id = p_dealership_id;
  v_duracao := COALESCE(v_config.duracao_padrao_minutos, 30);
  v_intervalo := COALESCE(v_config.intervalo_entre_slots, 0);

  IF p_salesperson_id IS NULL THEN
    SELECT ARRAY_AGG(id) INTO v_salespersons
    FROM employees
    WHERE dealership_id = p_dealership_id
      AND is_active = TRUE
      AND role IN ('salesperson', 'manager', 'owner');
  ELSE
    v_salespersons := ARRAY[p_salesperson_id];
  END IF;

  v_current_date := p_data_inicio;

  WHILE v_current_date <= p_data_fim LOOP
    v_dia_semana := EXTRACT(DOW FROM v_current_date);

    SELECT * INTO v_horario
    FROM horarios_funcionamento
    WHERE dealership_id = p_dealership_id AND dia_semana = v_dia_semana;

    IF FOUND AND v_horario.aberto AND v_horario.hora_abertura IS NOT NULL THEN
      v_current_time := v_horario.hora_abertura;

      WHILE v_current_time < v_horario.hora_fechamento LOOP
        v_slot_end := v_current_time + (v_duracao || ' minutes')::INTERVAL;

        IF v_slot_end > v_horario.hora_fechamento THEN
          EXIT;
        END IF;

        -- Skip lunch break
        IF v_horario.almoco_inicio IS NOT NULL AND v_horario.almoco_fim IS NOT NULL THEN
          IF v_current_time >= v_horario.almoco_inicio AND v_current_time < v_horario.almoco_fim THEN
            v_current_time := v_horario.almoco_fim;
            CONTINUE;
          END IF;
        END IF;

        v_slot_inicio := (v_current_date::TEXT || ' ' || v_current_time::TEXT)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo';
        v_slot_fim := (v_current_date::TEXT || ' ' || v_slot_end::TEXT)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo';

        -- Find available salespersons for this slot
        v_available := '{}';
        IF v_salespersons IS NOT NULL THEN
          FOREACH v_salesperson IN ARRAY v_salespersons LOOP
            IF check_slot_disponivel(p_dealership_id, v_salesperson, v_slot_inicio, v_slot_fim) THEN
              v_available := v_available || v_salesperson;
            END IF;
          END LOOP;
        END IF;

        data := v_current_date;
        dia_semana := v_dia_semana;
        dia_nome := CASE v_dia_semana
          WHEN 0 THEN 'Domingo'
          WHEN 1 THEN 'Segunda-feira'
          WHEN 2 THEN 'Terça-feira'
          WHEN 3 THEN 'Quarta-feira'
          WHEN 4 THEN 'Quinta-feira'
          WHEN 5 THEN 'Sexta-feira'
          WHEN 6 THEN 'Sábado'
        END;
        horario := v_current_time;
        horario_fim := v_slot_end;
        disponivel := array_length(v_available, 1) > 0;
        salespersons_disponiveis := v_available;

        RETURN NEXT;

        v_current_time := v_current_time + (v_duracao || ' minutes')::INTERVAL;
        IF v_intervalo > 0 THEN
          v_current_time := v_current_time + (v_intervalo || ' minutes')::INTERVAL;
        END IF;
      END LOOP;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create appointment with race-condition protection
CREATE OR REPLACE FUNCTION criar_agendamento(
  p_dealership_id UUID,
  p_data_inicio TIMESTAMPTZ,
  p_data_fim TIMESTAMPTZ,
  p_lead_nome VARCHAR,
  p_lead_telefone VARCHAR,
  p_lead_email VARCHAR DEFAULT NULL,
  p_tipo VARCHAR DEFAULT 'visita',
  p_vehicle_id UUID DEFAULT NULL,
  p_veiculo_interesse TEXT DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_origem VARCHAR DEFAULT 'widget',
  p_dados_qualificacao JSONB DEFAULT '{}',
  p_conversa_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_salesperson_id UUID;
  v_salesperson_name VARCHAR;
  v_salesperson_phone VARCHAR;
  v_agendamento agendamentos%ROWTYPE;
  v_config calendario_config%ROWTYPE;
  v_available_salespersons UUID[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_dealership_id::TEXT || p_data_inicio::TEXT));

  SELECT * INTO v_config FROM calendario_config WHERE dealership_id = p_dealership_id;

  IF p_salesperson_id IS NOT NULL THEN
    IF NOT check_slot_disponivel(p_dealership_id, p_salesperson_id, p_data_inicio, p_data_fim) THEN
      RETURN json_build_object(
        'success', FALSE,
        'error', 'Este horário não está mais disponível.',
        'error_code', 'SLOT_UNAVAILABLE'
      );
    END IF;
    v_salesperson_id := p_salesperson_id;
  ELSE
    SELECT ARRAY_AGG(e.id) INTO v_available_salespersons
    FROM employees e
    WHERE e.dealership_id = p_dealership_id
      AND e.is_active = TRUE
      AND e.role IN ('salesperson', 'manager', 'owner')
      AND check_slot_disponivel(p_dealership_id, e.id, p_data_inicio, p_data_fim);

    IF v_available_salespersons IS NULL OR array_length(v_available_salespersons, 1) = 0 THEN
      RETURN json_build_object(
        'success', FALSE,
        'error', 'Não há vendedores disponíveis neste horário. Por favor, escolha outro.',
        'error_code', 'NO_SALESPEOPLE_AVAILABLE'
      );
    END IF;

    -- Round-robin
    IF v_config.metodo_distribuicao = 'round_robin' AND v_config.ultimo_salesperson_id IS NOT NULL THEN
      SELECT id INTO v_salesperson_id
      FROM employees
      WHERE id = ANY(v_available_salespersons)
        AND id > v_config.ultimo_salesperson_id
      ORDER BY id LIMIT 1;

      IF v_salesperson_id IS NULL THEN
        v_salesperson_id := v_available_salespersons[1];
      END IF;
    ELSE
      v_salesperson_id := v_available_salespersons[1];
    END IF;

    UPDATE calendario_config
    SET ultimo_salesperson_id = v_salesperson_id, updated_at = NOW()
    WHERE dealership_id = p_dealership_id;
  END IF;

  SELECT name, phone INTO v_salesperson_name, v_salesperson_phone
  FROM employees WHERE id = v_salesperson_id;

  INSERT INTO agendamentos (
    dealership_id, data_inicio, data_fim,
    lead_nome, lead_telefone, lead_email,
    tipo, vehicle_id, veiculo_interesse,
    salesperson_id, origem, dados_qualificacao,
    conversa_id, status
  ) VALUES (
    p_dealership_id, p_data_inicio, p_data_fim,
    p_lead_nome, p_lead_telefone, p_lead_email,
    p_tipo, p_vehicle_id, p_veiculo_interesse,
    v_salesperson_id, p_origem, p_dados_qualificacao,
    p_conversa_id, 'agendado'
  ) RETURNING * INTO v_agendamento;

  RETURN json_build_object(
    'success', TRUE,
    'agendamento', json_build_object(
      'id', v_agendamento.id,
      'data_inicio', v_agendamento.data_inicio,
      'data_fim', v_agendamento.data_fim,
      'tipo', v_agendamento.tipo,
      'status', v_agendamento.status
    ),
    'vendedor', json_build_object(
      'id', v_salesperson_id,
      'nome', v_salesperson_name,
      'telefone', v_salesperson_phone
    )
  );

EXCEPTION
  WHEN exclusion_violation THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário.',
      'error_code', 'DOUBLE_BOOKING_PREVENTED'
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Erro ao criar agendamento: ' || SQLERRM,
      'error_code', 'UNKNOWN_ERROR'
    );
END;
$$ LANGUAGE plpgsql;

-- Cancel an appointment
CREATE OR REPLACE FUNCTION cancelar_agendamento(
  p_agendamento_id UUID,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  UPDATE agendamentos
  SET
    status = 'cancelado',
    observacoes_internas = COALESCE(observacoes_internas, '') ||
      E'\n[' || NOW()::TEXT || '] Cancelado' || COALESCE(' - Motivo: ' || p_motivo, ''),
    updated_at = NOW()
  WHERE id = p_agendamento_id
    AND status NOT IN ('cancelado', 'concluido');

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', 'Agendamento não encontrado ou já finalizado');
  END IF;

  RETURN json_build_object('success', TRUE, 'agendamento_id', p_agendamento_id);
END;
$$ LANGUAGE plpgsql;

-- Get calendar view for dashboard
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
  lead_nome VARCHAR,
  lead_telefone VARCHAR,
  tipo VARCHAR,
  veiculo_interesse TEXT,
  status VARCHAR,
  salesperson_id UUID,
  salesperson_name VARCHAR,
  cor VARCHAR,
  origem VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.data_inicio,
    a.data_fim,
    a.lead_nome,
    a.lead_telefone,
    a.tipo,
    COALESCE(v.brand || ' ' || v.model || ' ' || v.year_model::TEXT, a.veiculo_interesse) AS veiculo_interesse,
    a.status,
    a.salesperson_id,
    e.name AS salesperson_name,
    CASE a.status
      WHEN 'agendado'       THEN '#3B82F6'
      WHEN 'confirmado'     THEN '#10B981'
      WHEN 'em_atendimento' THEN '#F59E0B'
      WHEN 'concluido'      THEN '#6B7280'
      WHEN 'cancelado'      THEN '#EF4444'
      WHEN 'no_show'        THEN '#DC2626'
      ELSE '#00D9FF'
    END AS cor,
    a.origem
  FROM agendamentos a
  LEFT JOIN vehicles v ON a.vehicle_id = v.id
  LEFT JOIN employees e ON a.salesperson_id = e.id
  WHERE a.dealership_id = p_dealership_id
    AND (p_salesperson_id IS NULL OR a.salesperson_id = p_salesperson_id)
    AND a.data_inicio >= p_data_inicio
    AND a.data_inicio < (p_data_fim + 1)
  ORDER BY a.data_inicio;
END;
$$ LANGUAGE plpgsql;

-- Get today's appointments for a salesperson
CREATE OR REPLACE FUNCTION get_agendamentos_hoje(p_salesperson_id UUID)
RETURNS TABLE (
  id UUID,
  data_inicio TIMESTAMPTZ,
  lead_nome VARCHAR,
  lead_telefone VARCHAR,
  tipo VARCHAR,
  status VARCHAR,
  minutos_ate_inicio INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.data_inicio,
    a.lead_nome,
    a.lead_telefone,
    a.tipo,
    a.status,
    (EXTRACT(EPOCH FROM (a.data_inicio - NOW())) / 60)::INTEGER AS minutos_ate_inicio
  FROM agendamentos a
  WHERE a.salesperson_id = p_salesperson_id
    AND a.data_inicio::DATE = CURRENT_DATE
    AND a.status NOT IN ('cancelado', 'concluido')
  ORDER BY a.data_inicio;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE horarios_funcionamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots_bloqueados ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_integracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dealership_isolation" ON horarios_funcionamento
  FOR ALL USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "dealership_isolation" ON slots_bloqueados
  FOR ALL USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "dealership_isolation" ON agendamentos
  FOR ALL USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "dealership_isolation" ON calendario_config
  FOR ALL USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "dealership_isolation" ON widget_conversas
  FOR ALL USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "own_integrations" ON calendario_integracoes
  FOR ALL USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- Widget API: allow anonymous reads for widget_conversas inserts (service role handles this)
-- No anon policy needed — widget routes use SUPABASE_SERVICE_ROLE_KEY
