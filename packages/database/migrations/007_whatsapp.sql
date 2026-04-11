-- =============================================================================
-- Migration 007: WhatsApp AI Chatbot
-- =============================================================================
-- Tables:
--   whatsapp_sessoes       → per-dealership WASenderAPI session config
--   whatsapp_conversas     → one row per contact phone number
--   whatsapp_mensagens     → every individual message (in + out)
--   whatsapp_prompts       → custom AI prompt templates
-- =============================================================================

-- ─── whatsapp_sessoes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_sessoes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id               uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,

  -- WASenderAPI credentials
  wasender_session_id         text NOT NULL,
  wasender_api_key            text NOT NULL,

  -- Connected number info
  telefone                    text,
  nome                        text,
  status                      text NOT NULL DEFAULT 'desconectado'
    CHECK (status IN ('conectado','desconectado','qr_pendente','erro')),

  -- AI settings
  ai_ativo                    boolean NOT NULL DEFAULT true,
  modelo_padrao               text    NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  prompt_sistema              text,
  horario_atendimento_inicio  time    DEFAULT '08:00',
  horario_atendimento_fim     time    DEFAULT '18:00',
  mensagem_fora_horario       text,

  -- Tracking
  ultimo_status_check         timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (dealership_id)
);

-- ─── whatsapp_conversas ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id           uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,

  telefone                text NOT NULL,           -- E.164: +5511999999999
  telefone_limpo          text NOT NULL,           -- digits only: 5511999999999
  nome_contato            text,
  remote_jid              text,                    -- WhatsApp JID

  status                  text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','arquivado','bloqueado')),

  -- AI context
  contexto_resumo         text,
  ultima_intencao         text,
  veiculo_interesse_id    uuid REFERENCES vehicles(id) ON DELETE SET NULL,

  total_mensagens         integer NOT NULL DEFAULT 0,
  ultima_mensagem_em      timestamptz,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversas_telefone_dealer
  ON whatsapp_conversas (dealership_id, telefone_limpo);

CREATE INDEX IF NOT EXISTS idx_conversas_ultima_mensagem
  ON whatsapp_conversas (ultima_mensagem_em DESC);

-- ─── whatsapp_mensagens ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id         uuid NOT NULL REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
  dealership_id       uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,

  wasender_msg_id     text,
  direcao             text NOT NULL CHECK (direcao IN ('entrada','saida')),
  tipo                text NOT NULL DEFAULT 'texto'
    CHECK (tipo IN ('texto','imagem','audio','video','documento','localizacao','contato')),

  conteudo            text NOT NULL,
  midia_url           text,
  midia_tipo          text,

  -- AI processing metadata
  processado_por_ia   boolean NOT NULL DEFAULT false,
  tokens_entrada      integer,
  tokens_saida        integer,
  modelo_usado        text,
  tempo_resposta_ms   integer,

  status              text NOT NULL DEFAULT 'enviado'
    CHECK (status IN ('pendente','enviado','entregue','lido','falhou')),
  erro                text,

  criado_em           timestamptz NOT NULL DEFAULT now(),
  enviado_em          timestamptz,
  entregue_em         timestamptz,
  lido_em             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa
  ON whatsapp_mensagens (conversa_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_wasender
  ON whatsapp_mensagens (wasender_msg_id);

-- ─── whatsapp_prompts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_prompts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  tipo          text NOT NULL
    CHECK (tipo IN ('saudacao','estoque','preco','agendamento','financiamento','fora_horario')),
  prompt        text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE whatsapp_sessoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_prompts   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_sessoes_dealership"   ON whatsapp_sessoes
  FOR ALL USING (dealership_id = my_dealership_id());

CREATE POLICY "whatsapp_conversas_dealership" ON whatsapp_conversas
  FOR ALL USING (dealership_id = my_dealership_id());

CREATE POLICY "whatsapp_mensagens_dealership" ON whatsapp_mensagens
  FOR ALL USING (dealership_id = my_dealership_id());

CREATE POLICY "whatsapp_prompts_dealership"   ON whatsapp_prompts
  FOR ALL USING (dealership_id = my_dealership_id());
