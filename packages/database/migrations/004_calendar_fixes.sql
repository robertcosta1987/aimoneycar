-- Fix: remove role restriction in get_slots_disponiveis and criar_agendamento
-- Employees imported from MDB have Portuguese roles (VENDEDOR, GERENTE) not English ones.
-- Use is_active = TRUE only so all active staff can receive appointments.

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
    -- Use ALL active employees regardless of role
    SELECT ARRAY_AGG(id) INTO v_salespersons
    FROM employees
    WHERE dealership_id = p_dealership_id
      AND is_active = TRUE;
  ELSE
    v_salespersons := ARRAY[p_salesperson_id];
  END IF;

  -- If no active employees, return no slots
  IF v_salespersons IS NULL OR array_length(v_salespersons, 1) = 0 THEN
    RETURN;
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
        FOREACH v_salesperson IN ARRAY v_salespersons LOOP
          IF check_slot_disponivel(p_dealership_id, v_salesperson, v_slot_inicio, v_slot_fim) THEN
            v_available := v_available || v_salesperson;
          END IF;
        END LOOP;

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

-- Fix criar_agendamento to also use is_active = TRUE only (no role filter)
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
    -- Use ALL active employees regardless of role
    SELECT ARRAY_AGG(e.id) INTO v_available_salespersons
    FROM employees e
    WHERE e.dealership_id = p_dealership_id
      AND e.is_active = TRUE
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
END;
$$ LANGUAGE plpgsql;
