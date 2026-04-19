


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cancelar_agendamento"("p_agendamento_id" "uuid", "p_motivo" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."cancelar_agendamento"("p_agendamento_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_slot_disponivel"("p_dealership_id" "uuid", "p_salesperson_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."check_slot_disponivel"("p_dealership_id" "uuid", "p_salesperson_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."criar_agendamento"("p_dealership_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone, "p_lead_nome" character varying, "p_lead_telefone" character varying, "p_lead_email" character varying DEFAULT NULL::character varying, "p_tipo" character varying DEFAULT 'visita'::character varying, "p_vehicle_id" "uuid" DEFAULT NULL::"uuid", "p_veiculo_interesse" "text" DEFAULT NULL::"text", "p_salesperson_id" "uuid" DEFAULT NULL::"uuid", "p_origem" character varying DEFAULT 'widget'::character varying, "p_dados_qualificacao" "jsonb" DEFAULT '{}'::"jsonb", "p_conversa_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."criar_agendamento"("p_dealership_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone, "p_lead_nome" character varying, "p_lead_telefone" character varying, "p_lead_email" character varying, "p_tipo" character varying, "p_vehicle_id" "uuid", "p_veiculo_interesse" "text", "p_salesperson_id" "uuid", "p_origem" character varying, "p_dados_qualificacao" "jsonb", "p_conversa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_agendamentos_hoje"("p_salesperson_id" "uuid") RETURNS TABLE("id" "uuid", "data_inicio" timestamp with time zone, "lead_nome" character varying, "lead_telefone" character varying, "tipo" character varying, "status" character varying, "minutos_ate_inicio" integer)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_agendamentos_hoje"("p_salesperson_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_calendario_dashboard"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "data_inicio" timestamp with time zone, "data_fim" timestamp with time zone, "lead_nome" character varying, "lead_telefone" character varying, "tipo" character varying, "veiculo_interesse" "text", "status" character varying, "salesperson_id" "uuid", "salesperson_name" character varying, "cor" character varying, "origem" character varying)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_calendario_dashboard"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"("d_id" "uuid") RETURNS json
    LANGUAGE "sql" STABLE
    AS $$
  SELECT json_build_object(
    'total_vehicles',     count(*) FILTER (WHERE status != 'sold'),
    'available_vehicles', count(*) FILTER (WHERE status = 'available'),
    'critical_vehicles',  count(*) FILTER (WHERE status = 'available' AND days_in_stock > 60),
    'avg_days_in_stock',  COALESCE(ROUND(AVG(days_in_stock) FILTER (WHERE status = 'available')), 0),
    'total_expenses',     COALESCE((SELECT SUM(amount) FROM expenses WHERE dealership_id = d_id), 0),
    'monthly_sales',      COUNT(*) FILTER (WHERE status = 'sold' AND sale_date >= CURRENT_DATE - INTERVAL '30 days'),
    'monthly_revenue',    COALESCE(SUM(sale_price) FILTER (WHERE status = 'sold' AND sale_date >= CURRENT_DATE - INTERVAL '30 days'), 0),
    'monthly_profit',     COALESCE((
      SELECT SUM(v.sale_price - v.purchase_price - COALESCE(e.total_exp, 0))
      FROM vehicles v
      LEFT JOIN (
        SELECT vehicle_id, SUM(amount) AS total_exp
        FROM expenses
        WHERE dealership_id = d_id
        GROUP BY vehicle_id
      ) e ON e.vehicle_id = v.id
      WHERE v.dealership_id = d_id
        AND v.status = 'sold'
        AND v.sale_date >= CURRENT_DATE - INTERVAL '30 days'
    ), 0)
  )
  FROM vehicles
  WHERE dealership_id = d_id;
$$;


ALTER FUNCTION "public"."get_dashboard_stats"("d_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_slots_disponiveis"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("data" "date", "dia_semana" integer, "dia_nome" character varying, "horario" time without time zone, "horario_fim" time without time zone, "disponivel" boolean, "salespersons_disponiveis" "uuid"[])
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_slots_disponiveis"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_dealership_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$ SELECT dealership_id FROM users WHERE id = auth.uid(); $$;


ALTER FUNCTION "public"."my_dealership_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_days_in_stock"("d_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE vehicles
  SET days_in_stock = CASE
    WHEN sale_date IS NOT NULL THEN (sale_date - purchase_date)
    ELSE (CURRENT_DATE - purchase_date)
  END
  WHERE dealership_id = d_id;
$$;


ALTER FUNCTION "public"."refresh_days_in_stock"("d_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_horarios_funcionamento"("p_dealership_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."seed_horarios_funcionamento"("p_dealership_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_days_in_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.days_in_stock := case
    when new.sale_date is not null then (new.sale_date - new.purchase_date)
    else (current_date - new.purchase_date)
  end;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_days_in_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_relatorios_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_relatorios_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agendamentos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "data_inicio" timestamp with time zone NOT NULL,
    "data_fim" timestamp with time zone NOT NULL,
    "lead_nome" character varying(255) NOT NULL,
    "lead_telefone" character varying(20),
    "lead_email" character varying(255),
    "lead_cpf" character varying(14),
    "vehicle_id" "uuid",
    "veiculo_interesse" "text",
    "tipo" character varying(50) DEFAULT 'visita'::character varying,
    "salesperson_id" "uuid",
    "status" character varying(20) DEFAULT 'agendado'::character varying,
    "dados_qualificacao" "jsonb" DEFAULT '{}'::"jsonb",
    "origem" character varying(50) DEFAULT 'widget'::character varying,
    "conversa_id" "uuid",
    "google_event_id" character varying(255),
    "outlook_event_id" character varying(255),
    "ical_uid" character varying(255),
    "lembrete_24h_enviado" boolean DEFAULT false,
    "lembrete_1h_enviado" boolean DEFAULT false,
    "confirmacao_enviada" boolean DEFAULT false,
    "observacoes" "text",
    "observacoes_internas" "text",
    "resultado" character varying(50),
    "resultado_notas" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agendamentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_alerts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "action" "text",
    "action_data" "jsonb",
    "is_read" boolean DEFAULT false NOT NULL,
    "is_dismissed" boolean DEFAULT false NOT NULL,
    "sent_whatsapp" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_alerts_type_check" CHECK (("type" = ANY (ARRAY['critical'::"text", 'warning'::"text", 'info'::"text", 'success'::"text"])))
);


ALTER TABLE "public"."ai_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "bank_external_id" "text",
    "bank_id" "uuid",
    "agency" "text",
    "account" "text",
    "balance" numeric(15,2) DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "code" "text",
    "agency" "text",
    "account" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."banks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendario_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid",
    "duracao_padrao_minutos" integer DEFAULT 30,
    "intervalo_entre_slots" integer DEFAULT 0,
    "antecedencia_minima_horas" integer DEFAULT 2,
    "antecedencia_maxima_dias" integer DEFAULT 30,
    "max_agendamentos_por_slot" integer DEFAULT 1,
    "distribuicao_automatica" boolean DEFAULT true,
    "metodo_distribuicao" character varying(50) DEFAULT 'round_robin'::character varying,
    "ultimo_salesperson_id" "uuid",
    "notificar_whatsapp" boolean DEFAULT true,
    "notificar_email" boolean DEFAULT false,
    "lembrete_24h" boolean DEFAULT true,
    "lembrete_1h" boolean DEFAULT true,
    "widget_ativo" boolean DEFAULT true,
    "widget_cor" character varying(7) DEFAULT '#00D9FF'::character varying,
    "widget_posicao" character varying(20) DEFAULT 'bottom-right'::character varying,
    "widget_mensagem_inicial" "text" DEFAULT 'Olá! Posso ajudar a encontrar seu próximo carro? 🚗'::"text",
    "widget_avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calendario_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendario_integracoes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid",
    "employee_id" "uuid",
    "provider" character varying(20) NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "token_expiry" timestamp with time zone,
    "calendar_id" character varying(255) DEFAULT 'primary'::character varying,
    "sync_enabled" boolean DEFAULT true,
    "sync_direction" character varying(20) DEFAULT 'push'::character varying,
    "last_sync" timestamp with time zone,
    "sync_errors" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calendario_integracoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cancellation_reasons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "description" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cancellation_reasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_standards" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "employee_external_id" "text",
    "employee_id" "uuid",
    "percent" numeric(5,2),
    "min_value" numeric(12,2),
    "max_value" numeric(12,2),
    "type" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."commission_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "employee_external_id" "text",
    "employee_id" "uuid",
    "sale_id" "uuid",
    "amount" numeric(12,2),
    "percent" numeric(5,2),
    "date" "date",
    "paid_date" "date",
    "is_paid" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."commissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_asset_references" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "customer_external_id" "text",
    "customer_id" "uuid",
    "type" "text",
    "description" "text",
    "value" numeric(12,2),
    "financing_bank" "text",
    "monthly_payment" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_asset_references" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_commercial_data" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "customer_external_id" "text",
    "customer_id" "uuid",
    "company_name" "text",
    "cnpj" "text",
    "activity" "text",
    "monthly_revenue" numeric(12,2),
    "address" "text",
    "city" "text",
    "state" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_commercial_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_complements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "customer_external_id" "text",
    "customer_id" "uuid",
    "father_name" "text",
    "mother_name" "text",
    "spouse_name" "text",
    "spouse_cpf" "text",
    "spouse_income" numeric(12,2),
    "monthly_income" numeric(12,2),
    "profession" "text",
    "employer" "text",
    "employer_phone" "text",
    "employer_address" "text",
    "employer_city" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_complements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_origins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_origins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "cpf" "text",
    "cnpj" "text",
    "rg" "text",
    "birth_date" "date",
    "address" "text",
    "neighborhood" "text",
    "complement" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "source" "text",
    "origin_external_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dealerships" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "cnpj" "text",
    "phone" "text",
    "whatsapp" "text",
    "email" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "logo_url" "text",
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dealerships_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'pro'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."dealerships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_salaries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "employee_external_id" "text",
    "employee_id" "uuid",
    "date" "date",
    "amount" numeric(12,2),
    "type" "text",
    "description" "text",
    "bank_account_external_id" "text",
    "bank_account_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."employee_salaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "cpf" "text",
    "rg" "text",
    "role" "text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "hire_date" "date",
    "termination_date" "date",
    "base_salary" numeric(12,2),
    "commission_percent" numeric(5,2),
    "is_active" boolean DEFAULT true,
    "user_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."executive_report_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "recipient_emails" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "report_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "delivery_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "include_attachment" boolean DEFAULT true NOT NULL,
    "email_subject" "text" DEFAULT 'Relatório Executivo — {dealership_name} | {period}'::"text" NOT NULL,
    "email_body" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."executive_report_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."executive_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "period_label" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "triggered_by" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "executive_reports_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['manual'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "executive_reports_type_check" CHECK (("type" = ANY (ARRAY['weekly'::"text", 'monthly'::"text", 'quarterly'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."executive_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "category" "text" NOT NULL,
    "description" "text",
    "amount" numeric(12,2) NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "vendor_name" "text",
    "payment_method" "text",
    "receipt_url" "text",
    "created_by" "uuid",
    "external_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "customer_external_id" "text",
    "customer_id" "uuid",
    "bank" "text",
    "total_amount" numeric(12,2),
    "installments" integer,
    "interest_rate" numeric(7,4),
    "installment_amount" numeric(12,2),
    "down_payment" numeric(12,2),
    "start_date" "date",
    "contract_number" "text",
    "status" "text" DEFAULT 'active'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."financings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fuel_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fuel_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."general_enumerations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "type" "text" NOT NULL,
    "code" "text",
    "description" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."general_enumerations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."horarios_funcionamento" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid",
    "dia_semana" integer NOT NULL,
    "aberto" boolean DEFAULT true,
    "hora_abertura" time without time zone,
    "hora_fechamento" time without time zone,
    "almoco_inicio" time without time zone,
    "almoco_fim" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."horarios_funcionamento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."imports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "filename" "text",
    "file_type" "text",
    "file_size" bigint,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "records_imported" integer DEFAULT 0 NOT NULL,
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "imports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'downloading'::"text", 'parsing'::"text", 'importing_referencias'::"text", 'importing_entidades'::"text", 'importing_detalhes'::"text", 'complete'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insurances" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "customer_external_id" "text",
    "customer_id" "uuid",
    "insurer" "text",
    "policy_number" "text",
    "insured_value" numeric(12,2),
    "premium" numeric(12,2),
    "start_date" "date",
    "end_date" "date",
    "coverage_type" "text",
    "status" "text" DEFAULT 'active'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."insurances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manufacturers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."manufacturers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nature_of_operation" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "description" "text" NOT NULL,
    "cfop" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nature_of_operation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ncm" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "code" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ncm" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nfe_dest" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "nfe_external_id" "text",
    "nfe_id" "uuid",
    "cpf_cnpj" "text",
    "name" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "phone" "text",
    "email" "text",
    "ie" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nfe_dest" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nfe_emit" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "nfe_external_id" "text",
    "nfe_id" "uuid",
    "cnpj" "text",
    "name" "text",
    "trade_name" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "phone" "text",
    "ie" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nfe_emit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nfe_ide" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "access_key" "text",
    "nfe_number" "text",
    "series" "text",
    "model" "text",
    "issue_date" timestamp with time zone,
    "nature_of_operation" "text",
    "operation_type" smallint,
    "total_value" numeric(15,2),
    "status" "text" DEFAULT 'pending'::"text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "xml_url" "text",
    "pdf_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nfe_ide" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nfe_prod" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "nfe_external_id" "text",
    "nfe_id" "uuid",
    "product_code" "text",
    "ean" "text",
    "description" "text",
    "ncm_code" "text",
    "cfop" "text",
    "unit" "text",
    "quantity" numeric(15,4),
    "unit_value" numeric(15,4),
    "total_value" numeric(15,2),
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nfe_prod" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."optionals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."optionals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_followups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "order_external_id" "text",
    "order_id" "uuid",
    "employee_external_id" "text",
    "employee_id" "uuid",
    "date" "date",
    "description" "text",
    "status" "text",
    "next_contact" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "customer_external_id" "text",
    "customer_id" "uuid",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "employee_external_id" "text",
    "employee_id" "uuid",
    "order_date" "date",
    "amount" numeric(12,2),
    "status" "text" DEFAULT 'open'::"text",
    "payment_method" "text",
    "down_payment" numeric(12,2),
    "cancellation_reason_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_accounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "category" "text",
    "type" "text",
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plan_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_sale_expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "description" "text",
    "amount" numeric(12,2),
    "date" "date",
    "plan_account_external_id" "text",
    "plan_account_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_sale_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_data" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "purchase_date" "date",
    "mileage" integer,
    "purchase_price" numeric(12,2),
    "supplier_external_id" "text",
    "supplier_id" "uuid",
    "supplier_name" "text",
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relatorios_agendados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "frequencia" "text" NOT NULL,
    "dia_semana" integer,
    "dia_mes" integer,
    "hora" "text" DEFAULT '08:00'::"text" NOT NULL,
    "destinatarios" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "periodo_dias" integer DEFAULT 30 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "relatorios_agendados_frequencia_check" CHECK (("frequencia" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "relatorios_agendados_tipo_check" CHECK (("tipo" = ANY (ARRAY['sales_overview'::"text", 'inventory_health'::"text", 'margin_analysis'::"text", 'lead_funnel'::"text", 'expense_breakdown'::"text", 'salesperson_performance'::"text", 'monthly_comparison'::"text"])))
);


ALTER TABLE "public"."relatorios_agendados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relatorios_enviados_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "relatorio_id" "uuid" NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "enviado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "destinatarios" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "erro" "text",
    "resend_id" "text",
    CONSTRAINT "relatorios_enviados_log_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."relatorios_enviados_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_data" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "sale_date" "date",
    "mileage" integer,
    "sale_price" numeric(12,2),
    "customer_external_id" "text",
    "customer_id" "uuid",
    "payment_method" "text",
    "notes" "text",
    "sale_record_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sale_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "customer_email" "text",
    "customer_cpf" "text",
    "sale_price" numeric(12,2) NOT NULL,
    "purchase_price" numeric(12,2) NOT NULL,
    "total_expenses" numeric(12,2) DEFAULT 0 NOT NULL,
    "profit" numeric(12,2) GENERATED ALWAYS AS ((("sale_price" - "purchase_price") - "total_expenses")) STORED,
    "profit_percent" numeric(8,4) GENERATED ALWAYS AS (
CASE
    WHEN ("purchase_price" > (0)::numeric) THEN (((("sale_price" - "purchase_price") - "total_expenses") / "purchase_price") * (100)::numeric)
    ELSE (0)::numeric
END) STORED,
    "payment_method" "text" NOT NULL,
    "down_payment" numeric(12,2),
    "financing_bank" "text",
    "sale_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "salesperson_id" "uuid",
    "salesperson_name" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_id" "text"
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slots_bloqueados" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid",
    "employee_id" "uuid",
    "data_inicio" timestamp with time zone NOT NULL,
    "data_fim" timestamp with time zone NOT NULL,
    "motivo" character varying(255),
    "tipo" character varying(50) DEFAULT 'manual'::character varying,
    "recorrente" boolean DEFAULT false,
    "recorrencia_regra" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."slots_bloqueados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."standard_expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "description" "text" NOT NULL,
    "plan_account_external_id" "text",
    "plan_account_id" "uuid",
    "amount" numeric(12,2),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."standard_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."standard_pendencies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "description" "text" NOT NULL,
    "category" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."standard_pendencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."text_configurations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "key" "text" NOT NULL,
    "content" "text",
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."text_configurations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "dealership_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "avatar_url" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'salesperson'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_apportionment" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "plan_account_external_id" "text",
    "plan_account_id" "uuid",
    "amount" numeric(12,2),
    "date" "date",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_apportionment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_delivery_protocols" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "customer_external_id" "text",
    "customer_id" "uuid",
    "delivery_date" "date",
    "mileage" integer,
    "fuel_level" "text",
    "description" "text",
    "signature_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_delivery_protocols" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "type" "text",
    "number" "text",
    "issue_date" "date",
    "expiry_date" "date",
    "file_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_fines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "date" "date",
    "description" "text",
    "amount" numeric(12,2),
    "issuing_agency" "text",
    "infraction_code" "text",
    "is_paid" boolean DEFAULT false,
    "paid_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_fines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_optionals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "optional_external_id" "text",
    "optional_id" "uuid",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_optionals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_pendencies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "standard_pendency_external_id" "text",
    "standard_pendency_id" "uuid",
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "date" "date",
    "amount" numeric(12,2),
    "resolved_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_pendencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_purchase_documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "vehicle_external_id" "text",
    "vehicle_id" "uuid",
    "type" "text",
    "number" "text",
    "issue_date" "date",
    "amount" numeric(12,2),
    "file_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_purchase_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_trades" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "incoming_vehicle_external_id" "text",
    "incoming_vehicle_id" "uuid",
    "outgoing_vehicle_external_id" "text",
    "outgoing_vehicle_id" "uuid",
    "customer_external_id" "text",
    "customer_id" "uuid",
    "trade_date" "date",
    "trade_in_value" numeric(12,2),
    "difference_amount" numeric(12,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_trades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "plate" "text",
    "chassis" "text",
    "renavam" "text",
    "brand" "text" NOT NULL,
    "model" "text" NOT NULL,
    "version" "text",
    "year_fab" integer NOT NULL,
    "year_model" integer NOT NULL,
    "color" "text",
    "mileage" integer DEFAULT 0 NOT NULL,
    "fuel" "text",
    "transmission" "text",
    "purchase_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "sale_price" numeric(12,2),
    "fipe_price" numeric(12,2),
    "min_price" numeric(12,2),
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "purchase_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "sale_date" "date",
    "days_in_stock" integer DEFAULT 0 NOT NULL,
    "supplier_name" "text",
    "customer_id" "text",
    "photos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "source" "text",
    "external_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicles_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'reserved'::"text", 'sold'::"text", 'consigned'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "external_id" "text",
    "name" "text" NOT NULL,
    "category" "text",
    "phone" "text",
    "email" "text",
    "cnpj" "text",
    "address" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."visao_geral_movimentacao" AS
 SELECT "id",
    "dealership_id",
    "external_id" AS "car_id",
    "plate",
    "brand",
    "model",
    "version",
    "year_fab",
    "year_model",
    "color",
    "mileage",
    "fuel",
    "purchase_price",
    "sale_price",
    "fipe_price",
    "purchase_date",
    "sale_date",
    "status",
    "source",
    COALESCE(( SELECT "sum"("e"."amount") AS "sum"
           FROM "public"."expenses" "e"
          WHERE ("e"."vehicle_id" = "v"."id")), (0)::numeric) AS "total_expenses",
    ((COALESCE("sale_price", (0)::numeric) - "purchase_price") - COALESCE(( SELECT "sum"("e"."amount") AS "sum"
           FROM "public"."expenses" "e"
          WHERE ("e"."vehicle_id" = "v"."id")), (0)::numeric)) AS "gross_profit",
        CASE
            WHEN (COALESCE("sale_price", (0)::numeric) > (0)::numeric) THEN "round"(((((COALESCE("sale_price", (0)::numeric) - "purchase_price") - COALESCE(( SELECT "sum"("e"."amount") AS "sum"
               FROM "public"."expenses" "e"
              WHERE ("e"."vehicle_id" = "v"."id")), (0)::numeric)) / "sale_price") * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "profit_percent",
        CASE
            WHEN ("sale_date" IS NOT NULL) THEN ("sale_date" - "purchase_date")
            ELSE (CURRENT_DATE - "purchase_date")
        END AS "days_in_stock"
   FROM "public"."vehicles" "v";


ALTER VIEW "public"."visao_geral_movimentacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "telefone" "text" NOT NULL,
    "telefone_limpo" "text" NOT NULL,
    "nome_contato" "text",
    "remote_jid" "text",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "contexto_resumo" "text",
    "ultima_intencao" "text",
    "veiculo_interesse_id" "uuid",
    "total_mensagens" integer DEFAULT 0 NOT NULL,
    "ultima_mensagem_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_conversas_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'encerrado'::"text", 'aguardando_humano'::"text", 'arquivado'::"text"])))
);


ALTER TABLE "public"."whatsapp_conversas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversa_id" "uuid" NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "wasender_msg_id" "text",
    "direcao" "text" NOT NULL,
    "tipo" "text" DEFAULT 'texto'::"text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "midia_url" "text",
    "midia_tipo" "text",
    "processado_por_ia" boolean DEFAULT false NOT NULL,
    "tokens_entrada" integer,
    "tokens_saida" integer,
    "modelo_usado" "text",
    "tempo_resposta_ms" integer,
    "status" "text" DEFAULT 'enviado'::"text" NOT NULL,
    "erro" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enviado_em" timestamp with time zone,
    "entregue_em" timestamp with time zone,
    "lido_em" timestamp with time zone,
    CONSTRAINT "whatsapp_mensagens_direcao_check" CHECK (("direcao" = ANY (ARRAY['entrada'::"text", 'saida'::"text"]))),
    CONSTRAINT "whatsapp_mensagens_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'enviado'::"text", 'entregue'::"text", 'lido'::"text", 'falhou'::"text"]))),
    CONSTRAINT "whatsapp_mensagens_tipo_check" CHECK (("tipo" = ANY (ARRAY['texto'::"text", 'imagem'::"text", 'audio'::"text", 'video'::"text", 'documento'::"text", 'localizacao'::"text", 'contato'::"text"])))
);


ALTER TABLE "public"."whatsapp_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_prompts_tipo_check" CHECK (("tipo" = ANY (ARRAY['saudacao'::"text", 'estoque'::"text", 'preco'::"text", 'agendamento'::"text", 'financiamento'::"text", 'fora_horario'::"text"])))
);


ALTER TABLE "public"."whatsapp_prompts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_sessoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dealership_id" "uuid" NOT NULL,
    "wasender_session_id" "text" NOT NULL,
    "wasender_api_key" "text" NOT NULL,
    "telefone" "text",
    "nome" "text",
    "status" "text" DEFAULT 'desconectado'::"text" NOT NULL,
    "ai_ativo" boolean DEFAULT true NOT NULL,
    "modelo_padrao" "text" DEFAULT 'claude-haiku-4-5-20251001'::"text" NOT NULL,
    "prompt_sistema" "text",
    "horario_atendimento_inicio" time without time zone DEFAULT '08:00:00'::time without time zone,
    "horario_atendimento_fim" time without time zone DEFAULT '18:00:00'::time without time zone,
    "mensagem_fora_horario" "text",
    "ultimo_status_check" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_sessoes_status_check" CHECK (("status" = ANY (ARRAY['conectado'::"text", 'desconectado'::"text", 'qr_pendente'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."whatsapp_sessoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."widget_conversas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dealership_id" "uuid",
    "visitor_id" character varying(100),
    "lead_nome" character varying(255),
    "lead_telefone" character varying(20),
    "lead_email" character varying(255),
    "mensagens" "jsonb" DEFAULT '[]'::"jsonb",
    "qualificado" boolean DEFAULT false,
    "dados_qualificacao" "jsonb" DEFAULT '{}'::"jsonb",
    "temperatura" character varying(20),
    "agendamento_id" "uuid",
    "convertido" boolean DEFAULT false,
    "pagina_origem" "text",
    "utm_source" character varying(100),
    "utm_medium" character varying(100),
    "utm_campaign" character varying(100),
    "dispositivo" character varying(50),
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."widget_conversas" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_alerts"
    ADD CONSTRAINT "ai_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banks"
    ADD CONSTRAINT "banks_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."banks"
    ADD CONSTRAINT "banks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendario_config"
    ADD CONSTRAINT "calendario_config_dealership_id_key" UNIQUE ("dealership_id");



ALTER TABLE ONLY "public"."calendario_config"
    ADD CONSTRAINT "calendario_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendario_integracoes"
    ADD CONSTRAINT "calendario_integracoes_employee_id_provider_key" UNIQUE ("employee_id", "provider");



ALTER TABLE ONLY "public"."calendario_integracoes"
    ADD CONSTRAINT "calendario_integracoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cancellation_reasons"
    ADD CONSTRAINT "cancellation_reasons_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."cancellation_reasons"
    ADD CONSTRAINT "cancellation_reasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_standards"
    ADD CONSTRAINT "commission_standards_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."commission_standards"
    ADD CONSTRAINT "commission_standards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_asset_references"
    ADD CONSTRAINT "customer_asset_references_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_commercial_data"
    ADD CONSTRAINT "customer_commercial_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_complements"
    ADD CONSTRAINT "customer_complements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_origins"
    ADD CONSTRAINT "customer_origins_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."customer_origins"
    ADD CONSTRAINT "customer_origins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dealerships"
    ADD CONSTRAINT "dealerships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dealerships"
    ADD CONSTRAINT "dealerships_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."employee_salaries"
    ADD CONSTRAINT "employee_salaries_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."employee_salaries"
    ADD CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."executive_report_schedules"
    ADD CONSTRAINT "executive_report_schedules_dealership_id_key" UNIQUE ("dealership_id");



ALTER TABLE ONLY "public"."executive_report_schedules"
    ADD CONSTRAINT "executive_report_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."executive_reports"
    ADD CONSTRAINT "executive_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_dealership_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financings"
    ADD CONSTRAINT "financings_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."financings"
    ADD CONSTRAINT "financings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fuel_types"
    ADD CONSTRAINT "fuel_types_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."fuel_types"
    ADD CONSTRAINT "fuel_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."general_enumerations"
    ADD CONSTRAINT "general_enumerations_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."general_enumerations"
    ADD CONSTRAINT "general_enumerations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."horarios_funcionamento"
    ADD CONSTRAINT "horarios_funcionamento_dealership_id_dia_semana_key" UNIQUE ("dealership_id", "dia_semana");



ALTER TABLE ONLY "public"."horarios_funcionamento"
    ADD CONSTRAINT "horarios_funcionamento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."imports"
    ADD CONSTRAINT "imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insurances"
    ADD CONSTRAINT "insurances_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."insurances"
    ADD CONSTRAINT "insurances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manufacturers"
    ADD CONSTRAINT "manufacturers_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."manufacturers"
    ADD CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nature_of_operation"
    ADD CONSTRAINT "nature_of_operation_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."nature_of_operation"
    ADD CONSTRAINT "nature_of_operation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ncm"
    ADD CONSTRAINT "ncm_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."ncm"
    ADD CONSTRAINT "ncm_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfe_dest"
    ADD CONSTRAINT "nfe_dest_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."nfe_dest"
    ADD CONSTRAINT "nfe_dest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfe_emit"
    ADD CONSTRAINT "nfe_emit_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."nfe_emit"
    ADD CONSTRAINT "nfe_emit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfe_ide"
    ADD CONSTRAINT "nfe_ide_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."nfe_ide"
    ADD CONSTRAINT "nfe_ide_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfe_prod"
    ADD CONSTRAINT "nfe_prod_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."nfe_prod"
    ADD CONSTRAINT "nfe_prod_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "no_double_booking" EXCLUDE USING "gist" ("salesperson_id" WITH =, "tstzrange"("data_inicio", "data_fim") WITH &&) WHERE ((("status")::"text" <> 'cancelado'::"text"));



ALTER TABLE ONLY "public"."slots_bloqueados"
    ADD CONSTRAINT "no_overlap_blocks" EXCLUDE USING "gist" ("employee_id" WITH =, "tstzrange"("data_inicio", "data_fim") WITH &&) WHERE (("employee_id" IS NOT NULL));



ALTER TABLE ONLY "public"."optionals"
    ADD CONSTRAINT "optionals_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."optionals"
    ADD CONSTRAINT "optionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_followups"
    ADD CONSTRAINT "order_followups_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."order_followups"
    ADD CONSTRAINT "order_followups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_accounts"
    ADD CONSTRAINT "plan_accounts_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."plan_accounts"
    ADD CONSTRAINT "plan_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_sale_expenses"
    ADD CONSTRAINT "post_sale_expenses_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."post_sale_expenses"
    ADD CONSTRAINT "post_sale_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_data"
    ADD CONSTRAINT "purchase_data_dealership_id_vehicle_external_id_key" UNIQUE ("dealership_id", "vehicle_external_id");



ALTER TABLE ONLY "public"."purchase_data"
    ADD CONSTRAINT "purchase_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relatorios_agendados"
    ADD CONSTRAINT "relatorios_agendados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relatorios_enviados_log"
    ADD CONSTRAINT "relatorios_enviados_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_data"
    ADD CONSTRAINT "sale_data_dealership_id_vehicle_external_id_key" UNIQUE ("dealership_id", "vehicle_external_id");



ALTER TABLE ONLY "public"."sale_data"
    ADD CONSTRAINT "sale_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slots_bloqueados"
    ADD CONSTRAINT "slots_bloqueados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."standard_expenses"
    ADD CONSTRAINT "standard_expenses_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."standard_expenses"
    ADD CONSTRAINT "standard_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."standard_pendencies"
    ADD CONSTRAINT "standard_pendencies_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."standard_pendencies"
    ADD CONSTRAINT "standard_pendencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."text_configurations"
    ADD CONSTRAINT "text_configurations_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."text_configurations"
    ADD CONSTRAINT "text_configurations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_apportionment"
    ADD CONSTRAINT "vehicle_apportionment_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicle_apportionment"
    ADD CONSTRAINT "vehicle_apportionment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_delivery_protocols"
    ADD CONSTRAINT "vehicle_delivery_protocols_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicle_delivery_protocols"
    ADD CONSTRAINT "vehicle_delivery_protocols_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_fines"
    ADD CONSTRAINT "vehicle_fines_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicle_fines"
    ADD CONSTRAINT "vehicle_fines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_optionals"
    ADD CONSTRAINT "vehicle_optionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_pendencies"
    ADD CONSTRAINT "vehicle_pendencies_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicle_pendencies"
    ADD CONSTRAINT "vehicle_pendencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_purchase_documents"
    ADD CONSTRAINT "vehicle_purchase_documents_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicle_purchase_documents"
    ADD CONSTRAINT "vehicle_purchase_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_trades"
    ADD CONSTRAINT "vehicle_trades_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicle_trades"
    ADD CONSTRAINT "vehicle_trades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_dealership_id_external_id_key" UNIQUE ("dealership_id", "external_id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_conversas"
    ADD CONSTRAINT "whatsapp_conversas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_mensagens"
    ADD CONSTRAINT "whatsapp_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_prompts"
    ADD CONSTRAINT "whatsapp_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_sessoes"
    ADD CONSTRAINT "whatsapp_sessoes_dealership_id_key" UNIQUE ("dealership_id");



ALTER TABLE ONLY "public"."whatsapp_sessoes"
    ADD CONSTRAINT "whatsapp_sessoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."widget_conversas"
    ADD CONSTRAINT "widget_conversas_pkey" PRIMARY KEY ("id");



CREATE INDEX "executive_reports_dealership_idx" ON "public"."executive_reports" USING "btree" ("dealership_id", "generated_at" DESC);



CREATE INDEX "idx_agendamentos_dealership" ON "public"."agendamentos" USING "btree" ("dealership_id", "status");



CREATE INDEX "idx_agendamentos_salesperson" ON "public"."agendamentos" USING "btree" ("salesperson_id", "data_inicio");



CREATE INDEX "idx_agendamentos_slot" ON "public"."agendamentos" USING "btree" ("dealership_id", "data_inicio", "data_fim");



CREATE INDEX "idx_agendamentos_status" ON "public"."agendamentos" USING "btree" ("status") WHERE (("status")::"text" <> ALL ((ARRAY['cancelado'::character varying, 'concluido'::character varying])::"text"[]));



CREATE INDEX "idx_bank_accounts_dealership" ON "public"."bank_accounts" USING "btree" ("dealership_id");



CREATE INDEX "idx_commissions_dealership" ON "public"."commissions" USING "btree" ("dealership_id");



CREATE INDEX "idx_commissions_employee" ON "public"."commissions" USING "btree" ("employee_id");



CREATE INDEX "idx_commissions_vehicle" ON "public"."commissions" USING "btree" ("vehicle_id");



CREATE UNIQUE INDEX "idx_conversas_telefone_dealer" ON "public"."whatsapp_conversas" USING "btree" ("dealership_id", "telefone_limpo");



CREATE INDEX "idx_conversas_ultima_mensagem" ON "public"."whatsapp_conversas" USING "btree" ("ultima_mensagem_em" DESC);



CREATE INDEX "idx_customer_assets_customer" ON "public"."customer_asset_references" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_commercial_customer" ON "public"."customer_commercial_data" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_complements_customer" ON "public"."customer_complements" USING "btree" ("customer_id");



CREATE INDEX "idx_customers_dealership" ON "public"."customers" USING "btree" ("dealership_id");



CREATE INDEX "idx_customers_phone" ON "public"."customers" USING "btree" ("phone");



CREATE INDEX "idx_delivery_protocols_vehicle" ON "public"."vehicle_delivery_protocols" USING "btree" ("vehicle_id");



CREATE INDEX "idx_employee_salaries_dealership" ON "public"."employee_salaries" USING "btree" ("dealership_id");



CREATE INDEX "idx_employee_salaries_employee" ON "public"."employee_salaries" USING "btree" ("employee_id");



CREATE INDEX "idx_employees_dealership" ON "public"."employees" USING "btree" ("dealership_id");



CREATE UNIQUE INDEX "idx_expenses_external" ON "public"."expenses" USING "btree" ("dealership_id", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE INDEX "idx_financings_customer" ON "public"."financings" USING "btree" ("customer_id");



CREATE INDEX "idx_financings_dealership" ON "public"."financings" USING "btree" ("dealership_id");



CREATE INDEX "idx_financings_vehicle" ON "public"."financings" USING "btree" ("vehicle_id");



CREATE INDEX "idx_general_enumerations_type" ON "public"."general_enumerations" USING "btree" ("dealership_id", "type");



CREATE INDEX "idx_insurances_dealership" ON "public"."insurances" USING "btree" ("dealership_id");



CREATE INDEX "idx_insurances_vehicle" ON "public"."insurances" USING "btree" ("vehicle_id");



CREATE INDEX "idx_manufacturers_dealership" ON "public"."manufacturers" USING "btree" ("dealership_id");



CREATE INDEX "idx_mensagens_conversa" ON "public"."whatsapp_mensagens" USING "btree" ("conversa_id", "criado_em" DESC);



CREATE INDEX "idx_mensagens_wasender" ON "public"."whatsapp_mensagens" USING "btree" ("wasender_msg_id");



CREATE UNIQUE INDEX "idx_nfe_ide_access_key" ON "public"."nfe_ide" USING "btree" ("dealership_id", "access_key") WHERE ("access_key" IS NOT NULL);



CREATE INDEX "idx_nfe_ide_dealership" ON "public"."nfe_ide" USING "btree" ("dealership_id");



CREATE INDEX "idx_nfe_ide_vehicle" ON "public"."nfe_ide" USING "btree" ("vehicle_id");



CREATE INDEX "idx_nfe_prod_nfe" ON "public"."nfe_prod" USING "btree" ("nfe_id");



CREATE INDEX "idx_order_followups_order" ON "public"."order_followups" USING "btree" ("order_id");



CREATE INDEX "idx_orders_customer" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "idx_orders_date" ON "public"."orders" USING "btree" ("order_date");



CREATE INDEX "idx_orders_dealership" ON "public"."orders" USING "btree" ("dealership_id");



CREATE INDEX "idx_orders_vehicle" ON "public"."orders" USING "btree" ("vehicle_id");



CREATE INDEX "idx_plan_accounts_dealership" ON "public"."plan_accounts" USING "btree" ("dealership_id");



CREATE INDEX "idx_post_sale_expenses_vehicle" ON "public"."post_sale_expenses" USING "btree" ("vehicle_id");



CREATE INDEX "idx_purchase_data_vehicle" ON "public"."purchase_data" USING "btree" ("vehicle_id");



CREATE INDEX "idx_sale_data_customer" ON "public"."sale_data" USING "btree" ("customer_id");



CREATE INDEX "idx_sale_data_vehicle" ON "public"."sale_data" USING "btree" ("vehicle_id");



CREATE UNIQUE INDEX "idx_sales_external" ON "public"."sales" USING "btree" ("dealership_id", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE INDEX "idx_slots_bloqueados_dealership" ON "public"."slots_bloqueados" USING "btree" ("dealership_id");



CREATE INDEX "idx_slots_bloqueados_range" ON "public"."slots_bloqueados" USING "gist" ("tstzrange"("data_inicio", "data_fim"));



CREATE INDEX "idx_vehicle_apportionment_vehicle" ON "public"."vehicle_apportionment" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_documents_vehicle" ON "public"."vehicle_documents" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_fines_vehicle" ON "public"."vehicle_fines" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_optionals_vehicle" ON "public"."vehicle_optionals" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_pendencies_vehicle" ON "public"."vehicle_pendencies" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_purchase_docs_vehicle" ON "public"."vehicle_purchase_documents" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_trades_incoming" ON "public"."vehicle_trades" USING "btree" ("incoming_vehicle_id");



CREATE INDEX "idx_vehicle_trades_outgoing" ON "public"."vehicle_trades" USING "btree" ("outgoing_vehicle_id");



CREATE INDEX "idx_vendors_dealership" ON "public"."vendors" USING "btree" ("dealership_id");



CREATE INDEX "idx_widget_conversas_convertido" ON "public"."widget_conversas" USING "btree" ("dealership_id", "convertido");



CREATE INDEX "idx_widget_conversas_dealership" ON "public"."widget_conversas" USING "btree" ("dealership_id");



CREATE OR REPLACE TRIGGER "trg_days_in_stock" BEFORE INSERT OR UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."set_days_in_stock"();



CREATE OR REPLACE TRIGGER "trg_relatorios_updated_at" BEFORE UPDATE ON "public"."relatorios_agendados" FOR EACH ROW EXECUTE FUNCTION "public"."update_relatorios_updated_at"();



CREATE OR REPLACE TRIGGER "update_bank_accounts_timestamp" BEFORE UPDATE ON "public"."bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_customers_timestamp" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_employees_timestamp" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_financings_timestamp" BEFORE UPDATE ON "public"."financings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_orders_timestamp" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_text_configurations_timestamp" BEFORE UPDATE ON "public"."text_configurations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_vendors_timestamp" BEFORE UPDATE ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_alerts"
    ADD CONSTRAINT "ai_alerts_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_alerts"
    ADD CONSTRAINT "ai_alerts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."banks"
    ADD CONSTRAINT "banks_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendario_config"
    ADD CONSTRAINT "calendario_config_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendario_config"
    ADD CONSTRAINT "calendario_config_ultimo_salesperson_id_fkey" FOREIGN KEY ("ultimo_salesperson_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."calendario_integracoes"
    ADD CONSTRAINT "calendario_integracoes_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendario_integracoes"
    ADD CONSTRAINT "calendario_integracoes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cancellation_reasons"
    ADD CONSTRAINT "cancellation_reasons_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_standards"
    ADD CONSTRAINT "commission_standards_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_standards"
    ADD CONSTRAINT "commission_standards_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."customer_asset_references"
    ADD CONSTRAINT "customer_asset_references_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."customer_asset_references"
    ADD CONSTRAINT "customer_asset_references_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_commercial_data"
    ADD CONSTRAINT "customer_commercial_data_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."customer_commercial_data"
    ADD CONSTRAINT "customer_commercial_data_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_complements"
    ADD CONSTRAINT "customer_complements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."customer_complements"
    ADD CONSTRAINT "customer_complements_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_origins"
    ADD CONSTRAINT "customer_origins_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_salaries"
    ADD CONSTRAINT "employee_salaries_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id");



ALTER TABLE ONLY "public"."employee_salaries"
    ADD CONSTRAINT "employee_salaries_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_salaries"
    ADD CONSTRAINT "employee_salaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."executive_report_schedules"
    ADD CONSTRAINT "executive_report_schedules_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."executive_reports"
    ADD CONSTRAINT "executive_reports_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financings"
    ADD CONSTRAINT "financings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."financings"
    ADD CONSTRAINT "financings_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financings"
    ADD CONSTRAINT "financings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."fuel_types"
    ADD CONSTRAINT "fuel_types_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."general_enumerations"
    ADD CONSTRAINT "general_enumerations_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."horarios_funcionamento"
    ADD CONSTRAINT "horarios_funcionamento_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."imports"
    ADD CONSTRAINT "imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."imports"
    ADD CONSTRAINT "imports_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insurances"
    ADD CONSTRAINT "insurances_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."insurances"
    ADD CONSTRAINT "insurances_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insurances"
    ADD CONSTRAINT "insurances_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."manufacturers"
    ADD CONSTRAINT "manufacturers_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nature_of_operation"
    ADD CONSTRAINT "nature_of_operation_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ncm"
    ADD CONSTRAINT "ncm_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nfe_dest"
    ADD CONSTRAINT "nfe_dest_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nfe_dest"
    ADD CONSTRAINT "nfe_dest_nfe_id_fkey" FOREIGN KEY ("nfe_id") REFERENCES "public"."nfe_ide"("id");



ALTER TABLE ONLY "public"."nfe_emit"
    ADD CONSTRAINT "nfe_emit_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nfe_emit"
    ADD CONSTRAINT "nfe_emit_nfe_id_fkey" FOREIGN KEY ("nfe_id") REFERENCES "public"."nfe_ide"("id");



ALTER TABLE ONLY "public"."nfe_ide"
    ADD CONSTRAINT "nfe_ide_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nfe_ide"
    ADD CONSTRAINT "nfe_ide_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."nfe_prod"
    ADD CONSTRAINT "nfe_prod_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nfe_prod"
    ADD CONSTRAINT "nfe_prod_nfe_id_fkey" FOREIGN KEY ("nfe_id") REFERENCES "public"."nfe_ide"("id");



ALTER TABLE ONLY "public"."nfe_prod"
    ADD CONSTRAINT "nfe_prod_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."optionals"
    ADD CONSTRAINT "optionals_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_followups"
    ADD CONSTRAINT "order_followups_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_followups"
    ADD CONSTRAINT "order_followups_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."order_followups"
    ADD CONSTRAINT "order_followups_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cancellation_reason_id_fkey" FOREIGN KEY ("cancellation_reason_id") REFERENCES "public"."cancellation_reasons"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."plan_accounts"
    ADD CONSTRAINT "plan_accounts_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_accounts"
    ADD CONSTRAINT "plan_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."plan_accounts"("id");



ALTER TABLE ONLY "public"."post_sale_expenses"
    ADD CONSTRAINT "post_sale_expenses_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_sale_expenses"
    ADD CONSTRAINT "post_sale_expenses_plan_account_id_fkey" FOREIGN KEY ("plan_account_id") REFERENCES "public"."plan_accounts"("id");



ALTER TABLE ONLY "public"."post_sale_expenses"
    ADD CONSTRAINT "post_sale_expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."purchase_data"
    ADD CONSTRAINT "purchase_data_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_data"
    ADD CONSTRAINT "purchase_data_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."purchase_data"
    ADD CONSTRAINT "purchase_data_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."relatorios_agendados"
    ADD CONSTRAINT "relatorios_agendados_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relatorios_enviados_log"
    ADD CONSTRAINT "relatorios_enviados_log_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "public"."relatorios_agendados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_data"
    ADD CONSTRAINT "sale_data_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."sale_data"
    ADD CONSTRAINT "sale_data_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_data"
    ADD CONSTRAINT "sale_data_sale_record_id_fkey" FOREIGN KEY ("sale_record_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."sale_data"
    ADD CONSTRAINT "sale_data_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."slots_bloqueados"
    ADD CONSTRAINT "slots_bloqueados_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."slots_bloqueados"
    ADD CONSTRAINT "slots_bloqueados_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slots_bloqueados"
    ADD CONSTRAINT "slots_bloqueados_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."standard_expenses"
    ADD CONSTRAINT "standard_expenses_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."standard_expenses"
    ADD CONSTRAINT "standard_expenses_plan_account_id_fkey" FOREIGN KEY ("plan_account_id") REFERENCES "public"."plan_accounts"("id");



ALTER TABLE ONLY "public"."standard_pendencies"
    ADD CONSTRAINT "standard_pendencies_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."text_configurations"
    ADD CONSTRAINT "text_configurations_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_apportionment"
    ADD CONSTRAINT "vehicle_apportionment_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_apportionment"
    ADD CONSTRAINT "vehicle_apportionment_plan_account_id_fkey" FOREIGN KEY ("plan_account_id") REFERENCES "public"."plan_accounts"("id");



ALTER TABLE ONLY "public"."vehicle_apportionment"
    ADD CONSTRAINT "vehicle_apportionment_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_delivery_protocols"
    ADD CONSTRAINT "vehicle_delivery_protocols_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."vehicle_delivery_protocols"
    ADD CONSTRAINT "vehicle_delivery_protocols_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_delivery_protocols"
    ADD CONSTRAINT "vehicle_delivery_protocols_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_fines"
    ADD CONSTRAINT "vehicle_fines_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_fines"
    ADD CONSTRAINT "vehicle_fines_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_optionals"
    ADD CONSTRAINT "vehicle_optionals_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_optionals"
    ADD CONSTRAINT "vehicle_optionals_optional_id_fkey" FOREIGN KEY ("optional_id") REFERENCES "public"."optionals"("id");



ALTER TABLE ONLY "public"."vehicle_optionals"
    ADD CONSTRAINT "vehicle_optionals_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_pendencies"
    ADD CONSTRAINT "vehicle_pendencies_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_pendencies"
    ADD CONSTRAINT "vehicle_pendencies_standard_pendency_id_fkey" FOREIGN KEY ("standard_pendency_id") REFERENCES "public"."standard_pendencies"("id");



ALTER TABLE ONLY "public"."vehicle_pendencies"
    ADD CONSTRAINT "vehicle_pendencies_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_purchase_documents"
    ADD CONSTRAINT "vehicle_purchase_documents_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_purchase_documents"
    ADD CONSTRAINT "vehicle_purchase_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_trades"
    ADD CONSTRAINT "vehicle_trades_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."vehicle_trades"
    ADD CONSTRAINT "vehicle_trades_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_trades"
    ADD CONSTRAINT "vehicle_trades_incoming_vehicle_id_fkey" FOREIGN KEY ("incoming_vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicle_trades"
    ADD CONSTRAINT "vehicle_trades_outgoing_vehicle_id_fkey" FOREIGN KEY ("outgoing_vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_conversas"
    ADD CONSTRAINT "whatsapp_conversas_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_conversas"
    ADD CONSTRAINT "whatsapp_conversas_veiculo_interesse_id_fkey" FOREIGN KEY ("veiculo_interesse_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_mensagens"
    ADD CONSTRAINT "whatsapp_mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "public"."whatsapp_conversas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_mensagens"
    ADD CONSTRAINT "whatsapp_mensagens_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_prompts"
    ADD CONSTRAINT "whatsapp_prompts_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_sessoes"
    ADD CONSTRAINT "whatsapp_sessoes_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."widget_conversas"
    ADD CONSTRAINT "widget_conversas_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "public"."agendamentos"("id");



ALTER TABLE ONLY "public"."widget_conversas"
    ADD CONSTRAINT "widget_conversas_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE CASCADE;



ALTER TABLE "public"."agendamentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alerts_all" ON "public"."ai_alerts" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."bank_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_accounts_dealership_policy" ON "public"."bank_accounts" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."banks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "banks_dealership_policy" ON "public"."banks" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."calendario_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendario_integracoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cancellation_reasons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cancellation_reasons_dealership_policy" ON "public"."cancellation_reasons" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."commission_standards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commission_standards_dealership_policy" ON "public"."commission_standards" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."commissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commissions_dealership_policy" ON "public"."commissions" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "conversations_all" ON "public"."ai_conversations" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."customer_asset_references" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_asset_references_dealership_policy" ON "public"."customer_asset_references" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."customer_commercial_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_commercial_data_dealership_policy" ON "public"."customer_commercial_data" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."customer_complements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_complements_dealership_policy" ON "public"."customer_complements" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."customer_origins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_origins_dealership_policy" ON "public"."customer_origins" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_dealership_policy" ON "public"."customers" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "dealership_isolation" ON "public"."agendamentos" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "dealership_isolation" ON "public"."calendario_config" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "dealership_isolation" ON "public"."horarios_funcionamento" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "dealership_isolation" ON "public"."slots_bloqueados" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "dealership_isolation" ON "public"."widget_conversas" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "dealership_select" ON "public"."dealerships" FOR SELECT USING (("id" = "public"."my_dealership_id"()));



CREATE POLICY "dealership_update" ON "public"."dealerships" FOR UPDATE USING (("id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."dealerships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_salaries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_salaries_dealership_policy" ON "public"."employee_salaries" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_dealership_policy" ON "public"."employees" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."executive_report_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "executive_report_schedules_dealership" ON "public"."executive_report_schedules" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."executive_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "executive_reports_dealership" ON "public"."executive_reports" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_all" ON "public"."expenses" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."financings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financings_dealership_policy" ON "public"."financings" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."fuel_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fuel_types_dealership_policy" ON "public"."fuel_types" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."general_enumerations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "general_enumerations_dealership_policy" ON "public"."general_enumerations" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."horarios_funcionamento" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."imports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "imports_all" ON "public"."imports" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."insurances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insurances_dealership_policy" ON "public"."insurances" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."manufacturers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manufacturers_dealership_policy" ON "public"."manufacturers" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."nature_of_operation" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nature_of_operation_dealership_policy" ON "public"."nature_of_operation" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."ncm" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ncm_dealership_policy" ON "public"."ncm" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."nfe_dest" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nfe_dest_dealership_policy" ON "public"."nfe_dest" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."nfe_emit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nfe_emit_dealership_policy" ON "public"."nfe_emit" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."nfe_ide" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nfe_ide_dealership_policy" ON "public"."nfe_ide" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."nfe_prod" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nfe_prod_dealership_policy" ON "public"."nfe_prod" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."optionals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "optionals_dealership_policy" ON "public"."optionals" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."order_followups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_followups_dealership_policy" ON "public"."order_followups" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_dealership_policy" ON "public"."orders" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "own_integrations" ON "public"."calendario_integracoes" USING (("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."plan_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_accounts_dealership_policy" ON "public"."plan_accounts" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."post_sale_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_sale_expenses_dealership_policy" ON "public"."post_sale_expenses" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."purchase_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_data_dealership_policy" ON "public"."purchase_data" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."relatorios_agendados" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "relatorios_agendados_dealership" ON "public"."relatorios_agendados" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."relatorios_enviados_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "relatorios_log_dealership" ON "public"."relatorios_enviados_log" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."sale_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sale_data_dealership_policy" ON "public"."sale_data" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_all" ON "public"."sales" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."slots_bloqueados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."standard_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "standard_expenses_dealership_policy" ON "public"."standard_expenses" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."standard_pendencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "standard_pendencies_dealership_policy" ON "public"."standard_pendencies" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."text_configurations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "text_configurations_dealership_policy" ON "public"."text_configurations" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert" ON "public"."users" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users_select" ON "public"."users" FOR SELECT USING ((("dealership_id" = "public"."my_dealership_id"()) OR ("id" = "auth"."uid"())));



CREATE POLICY "users_update" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."vehicle_apportionment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_apportionment_dealership_policy" ON "public"."vehicle_apportionment" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_delivery_protocols" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_delivery_protocols_dealership_policy" ON "public"."vehicle_delivery_protocols" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_documents_dealership_policy" ON "public"."vehicle_documents" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_fines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_fines_dealership_policy" ON "public"."vehicle_fines" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_optionals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_optionals_dealership_policy" ON "public"."vehicle_optionals" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_pendencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_pendencies_dealership_policy" ON "public"."vehicle_pendencies" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_purchase_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_purchase_documents_dealership_policy" ON "public"."vehicle_purchase_documents" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_trades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_trades_dealership_policy" ON "public"."vehicle_trades" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_all" ON "public"."vehicles" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_dealership_policy" ON "public"."vendors" USING (("dealership_id" IN ( SELECT "users"."dealership_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."whatsapp_conversas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_conversas_dealership" ON "public"."whatsapp_conversas" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."whatsapp_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_mensagens_dealership" ON "public"."whatsapp_mensagens" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."whatsapp_prompts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_prompts_dealership" ON "public"."whatsapp_prompts" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."whatsapp_sessoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_sessoes_dealership" ON "public"."whatsapp_sessoes" USING (("dealership_id" = "public"."my_dealership_id"()));



ALTER TABLE "public"."widget_conversas" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."cancelar_agendamento"("p_agendamento_id" "uuid", "p_motivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancelar_agendamento"("p_agendamento_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancelar_agendamento"("p_agendamento_id" "uuid", "p_motivo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_slot_disponivel"("p_dealership_id" "uuid", "p_salesperson_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."check_slot_disponivel"("p_dealership_id" "uuid", "p_salesperson_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_slot_disponivel"("p_dealership_id" "uuid", "p_salesperson_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."criar_agendamento"("p_dealership_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone, "p_lead_nome" character varying, "p_lead_telefone" character varying, "p_lead_email" character varying, "p_tipo" character varying, "p_vehicle_id" "uuid", "p_veiculo_interesse" "text", "p_salesperson_id" "uuid", "p_origem" character varying, "p_dados_qualificacao" "jsonb", "p_conversa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."criar_agendamento"("p_dealership_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone, "p_lead_nome" character varying, "p_lead_telefone" character varying, "p_lead_email" character varying, "p_tipo" character varying, "p_vehicle_id" "uuid", "p_veiculo_interesse" "text", "p_salesperson_id" "uuid", "p_origem" character varying, "p_dados_qualificacao" "jsonb", "p_conversa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."criar_agendamento"("p_dealership_id" "uuid", "p_data_inicio" timestamp with time zone, "p_data_fim" timestamp with time zone, "p_lead_nome" character varying, "p_lead_telefone" character varying, "p_lead_email" character varying, "p_tipo" character varying, "p_vehicle_id" "uuid", "p_veiculo_interesse" "text", "p_salesperson_id" "uuid", "p_origem" character varying, "p_dados_qualificacao" "jsonb", "p_conversa_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_agendamentos_hoje"("p_salesperson_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_agendamentos_hoje"("p_salesperson_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_agendamentos_hoje"("p_salesperson_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_calendario_dashboard"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_calendario_dashboard"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_calendario_dashboard"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("d_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("d_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("d_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_slots_disponiveis"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_slots_disponiveis"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_slots_disponiveis"("p_dealership_id" "uuid", "p_data_inicio" "date", "p_data_fim" "date", "p_salesperson_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."my_dealership_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_dealership_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_dealership_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_days_in_stock"("d_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_days_in_stock"("d_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_days_in_stock"("d_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_horarios_funcionamento"("p_dealership_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_horarios_funcionamento"("p_dealership_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_horarios_funcionamento"("p_dealership_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_days_in_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_days_in_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_days_in_stock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_relatorios_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_relatorios_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_relatorios_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."agendamentos" TO "anon";
GRANT ALL ON TABLE "public"."agendamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."agendamentos" TO "service_role";



GRANT ALL ON TABLE "public"."ai_alerts" TO "anon";
GRANT ALL ON TABLE "public"."ai_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."ai_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."banks" TO "anon";
GRANT ALL ON TABLE "public"."banks" TO "authenticated";
GRANT ALL ON TABLE "public"."banks" TO "service_role";



GRANT ALL ON TABLE "public"."calendario_config" TO "anon";
GRANT ALL ON TABLE "public"."calendario_config" TO "authenticated";
GRANT ALL ON TABLE "public"."calendario_config" TO "service_role";



GRANT ALL ON TABLE "public"."calendario_integracoes" TO "anon";
GRANT ALL ON TABLE "public"."calendario_integracoes" TO "authenticated";
GRANT ALL ON TABLE "public"."calendario_integracoes" TO "service_role";



GRANT ALL ON TABLE "public"."cancellation_reasons" TO "anon";
GRANT ALL ON TABLE "public"."cancellation_reasons" TO "authenticated";
GRANT ALL ON TABLE "public"."cancellation_reasons" TO "service_role";



GRANT ALL ON TABLE "public"."commission_standards" TO "anon";
GRANT ALL ON TABLE "public"."commission_standards" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_standards" TO "service_role";



GRANT ALL ON TABLE "public"."commissions" TO "anon";
GRANT ALL ON TABLE "public"."commissions" TO "authenticated";
GRANT ALL ON TABLE "public"."commissions" TO "service_role";



GRANT ALL ON TABLE "public"."customer_asset_references" TO "anon";
GRANT ALL ON TABLE "public"."customer_asset_references" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_asset_references" TO "service_role";



GRANT ALL ON TABLE "public"."customer_commercial_data" TO "anon";
GRANT ALL ON TABLE "public"."customer_commercial_data" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_commercial_data" TO "service_role";



GRANT ALL ON TABLE "public"."customer_complements" TO "anon";
GRANT ALL ON TABLE "public"."customer_complements" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_complements" TO "service_role";



GRANT ALL ON TABLE "public"."customer_origins" TO "anon";
GRANT ALL ON TABLE "public"."customer_origins" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_origins" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."dealerships" TO "anon";
GRANT ALL ON TABLE "public"."dealerships" TO "authenticated";
GRANT ALL ON TABLE "public"."dealerships" TO "service_role";



GRANT ALL ON TABLE "public"."employee_salaries" TO "anon";
GRANT ALL ON TABLE "public"."employee_salaries" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_salaries" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."executive_report_schedules" TO "anon";
GRANT ALL ON TABLE "public"."executive_report_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."executive_report_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."executive_reports" TO "anon";
GRANT ALL ON TABLE "public"."executive_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."executive_reports" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."financings" TO "anon";
GRANT ALL ON TABLE "public"."financings" TO "authenticated";
GRANT ALL ON TABLE "public"."financings" TO "service_role";



GRANT ALL ON TABLE "public"."fuel_types" TO "anon";
GRANT ALL ON TABLE "public"."fuel_types" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_types" TO "service_role";



GRANT ALL ON TABLE "public"."general_enumerations" TO "anon";
GRANT ALL ON TABLE "public"."general_enumerations" TO "authenticated";
GRANT ALL ON TABLE "public"."general_enumerations" TO "service_role";



GRANT ALL ON TABLE "public"."horarios_funcionamento" TO "anon";
GRANT ALL ON TABLE "public"."horarios_funcionamento" TO "authenticated";
GRANT ALL ON TABLE "public"."horarios_funcionamento" TO "service_role";



GRANT ALL ON TABLE "public"."imports" TO "anon";
GRANT ALL ON TABLE "public"."imports" TO "authenticated";
GRANT ALL ON TABLE "public"."imports" TO "service_role";



GRANT ALL ON TABLE "public"."insurances" TO "anon";
GRANT ALL ON TABLE "public"."insurances" TO "authenticated";
GRANT ALL ON TABLE "public"."insurances" TO "service_role";



GRANT ALL ON TABLE "public"."manufacturers" TO "anon";
GRANT ALL ON TABLE "public"."manufacturers" TO "authenticated";
GRANT ALL ON TABLE "public"."manufacturers" TO "service_role";



GRANT ALL ON TABLE "public"."nature_of_operation" TO "anon";
GRANT ALL ON TABLE "public"."nature_of_operation" TO "authenticated";
GRANT ALL ON TABLE "public"."nature_of_operation" TO "service_role";



GRANT ALL ON TABLE "public"."ncm" TO "anon";
GRANT ALL ON TABLE "public"."ncm" TO "authenticated";
GRANT ALL ON TABLE "public"."ncm" TO "service_role";



GRANT ALL ON TABLE "public"."nfe_dest" TO "anon";
GRANT ALL ON TABLE "public"."nfe_dest" TO "authenticated";
GRANT ALL ON TABLE "public"."nfe_dest" TO "service_role";



GRANT ALL ON TABLE "public"."nfe_emit" TO "anon";
GRANT ALL ON TABLE "public"."nfe_emit" TO "authenticated";
GRANT ALL ON TABLE "public"."nfe_emit" TO "service_role";



GRANT ALL ON TABLE "public"."nfe_ide" TO "anon";
GRANT ALL ON TABLE "public"."nfe_ide" TO "authenticated";
GRANT ALL ON TABLE "public"."nfe_ide" TO "service_role";



GRANT ALL ON TABLE "public"."nfe_prod" TO "anon";
GRANT ALL ON TABLE "public"."nfe_prod" TO "authenticated";
GRANT ALL ON TABLE "public"."nfe_prod" TO "service_role";



GRANT ALL ON TABLE "public"."optionals" TO "anon";
GRANT ALL ON TABLE "public"."optionals" TO "authenticated";
GRANT ALL ON TABLE "public"."optionals" TO "service_role";



GRANT ALL ON TABLE "public"."order_followups" TO "anon";
GRANT ALL ON TABLE "public"."order_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."order_followups" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."plan_accounts" TO "anon";
GRANT ALL ON TABLE "public"."plan_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."post_sale_expenses" TO "anon";
GRANT ALL ON TABLE "public"."post_sale_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."post_sale_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_data" TO "anon";
GRANT ALL ON TABLE "public"."purchase_data" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_data" TO "service_role";



GRANT ALL ON TABLE "public"."relatorios_agendados" TO "anon";
GRANT ALL ON TABLE "public"."relatorios_agendados" TO "authenticated";
GRANT ALL ON TABLE "public"."relatorios_agendados" TO "service_role";



GRANT ALL ON TABLE "public"."relatorios_enviados_log" TO "anon";
GRANT ALL ON TABLE "public"."relatorios_enviados_log" TO "authenticated";
GRANT ALL ON TABLE "public"."relatorios_enviados_log" TO "service_role";



GRANT ALL ON TABLE "public"."sale_data" TO "anon";
GRANT ALL ON TABLE "public"."sale_data" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_data" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."slots_bloqueados" TO "anon";
GRANT ALL ON TABLE "public"."slots_bloqueados" TO "authenticated";
GRANT ALL ON TABLE "public"."slots_bloqueados" TO "service_role";



GRANT ALL ON TABLE "public"."standard_expenses" TO "anon";
GRANT ALL ON TABLE "public"."standard_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."standard_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."standard_pendencies" TO "anon";
GRANT ALL ON TABLE "public"."standard_pendencies" TO "authenticated";
GRANT ALL ON TABLE "public"."standard_pendencies" TO "service_role";



GRANT ALL ON TABLE "public"."text_configurations" TO "anon";
GRANT ALL ON TABLE "public"."text_configurations" TO "authenticated";
GRANT ALL ON TABLE "public"."text_configurations" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_apportionment" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_apportionment" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_apportionment" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_delivery_protocols" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_delivery_protocols" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_delivery_protocols" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_documents" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_fines" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_fines" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_fines" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_optionals" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_optionals" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_optionals" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_pendencies" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_pendencies" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_pendencies" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_purchase_documents" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_purchase_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_purchase_documents" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_trades" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_trades" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_trades" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT ALL ON TABLE "public"."visao_geral_movimentacao" TO "anon";
GRANT ALL ON TABLE "public"."visao_geral_movimentacao" TO "authenticated";
GRANT ALL ON TABLE "public"."visao_geral_movimentacao" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_conversas" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_conversas" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_conversas" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_mensagens" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_prompts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_sessoes" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_sessoes" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_sessoes" TO "service_role";



GRANT ALL ON TABLE "public"."widget_conversas" TO "anon";
GRANT ALL ON TABLE "public"."widget_conversas" TO "authenticated";
GRANT ALL ON TABLE "public"."widget_conversas" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































