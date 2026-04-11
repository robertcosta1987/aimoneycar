// types/whatsapp.ts

// ─── WASenderAPI wire types ───────────────────────────────────────────────────

export interface WASenderWebhookPayload {
  event: string
  timestamp: number
  data: {
    messages?: WASenderIncomingMessage
  }
}

export interface WASenderIncomingMessage {
  key: {
    id: string
    fromMe: boolean
    remoteJid: string
    addressingMode: string
    senderPn?: string
    cleanedSenderPn?: string
    senderLid?: string
  }
  messageBody: string
  message: {
    conversation?: string
    imageMessage?: {
      url: string
      mimetype: string
      caption?: string
    }
    videoMessage?: {
      url: string
      mimetype: string
      caption?: string
    }
    documentMessage?: {
      url: string
      mimetype: string
      fileName: string
    }
    audioMessage?: {
      url: string
      mimetype: string
    }
  }
  pushName?: string
}

export interface WASenderSendParams {
  to: string
  text?: string
  image?: string
  video?: string
  document?: string
  audio?: string
  caption?: string
  filename?: string
}

export interface WASenderResponse {
  success: boolean
  data?: {
    msgId: number | string
    jid: string
    status: string
  }
  error?: string
}

// ─── Database row types ───────────────────────────────────────────────────────

export interface WhatsAppSessao {
  id: string
  dealership_id: string
  wasender_session_id: string
  wasender_api_key: string
  telefone: string | null
  nome: string | null
  status: 'conectado' | 'desconectado' | 'qr_pendente' | 'erro'
  ai_ativo: boolean
  modelo_padrao: string
  prompt_sistema: string | null
  horario_atendimento_inicio: string | null
  horario_atendimento_fim: string | null
  mensagem_fora_horario: string | null
  ultimo_status_check: string | null
  created_at: string
  updated_at: string
}

export interface WhatsAppConversa {
  id: string
  dealership_id: string
  telefone: string
  telefone_limpo: string
  nome_contato: string | null
  remote_jid: string | null
  status: 'ativo' | 'arquivado' | 'bloqueado'
  contexto_resumo: string | null
  ultima_intencao: string | null
  veiculo_interesse_id: string | null
  total_mensagens: number
  ultima_mensagem_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface WhatsAppMensagem {
  id: string
  conversa_id: string
  dealership_id: string
  wasender_msg_id: string | null
  direcao: 'entrada' | 'saida'
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'localizacao' | 'contato'
  conteudo: string
  midia_url: string | null
  midia_tipo: string | null
  processado_por_ia: boolean
  tokens_entrada: number | null
  tokens_saida: number | null
  modelo_usado: string | null
  tempo_resposta_ms: number | null
  status: 'pendente' | 'enviado' | 'entregue' | 'lido' | 'falhou'
  erro: string | null
  criado_em: string
  enviado_em: string | null
  entregue_em: string | null
  lido_em: string | null
}

// ─── AI context types ─────────────────────────────────────────────────────────

export interface AIVehicle {
  id: string
  brand: string
  model: string
  year: number
  price: number
  mileage: number
  color: string | null
}

export interface AIContext {
  dealershipName: string
  dealershipInfo: {
    phone?: string | null
    whatsapp?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
  }
  conversationHistory: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  availableVehicles: AIVehicle[]
  customerName?: string | null
  previousIntent?: string | null
}

export interface AIResponse {
  message: string
  intent: string
  vehicleIds: string[]
  shouldTransferToHuman: boolean
}
