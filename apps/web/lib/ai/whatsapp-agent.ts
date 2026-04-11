/**
 * lib/ai/whatsapp-agent.ts
 *
 * Generates Claude AI responses for WhatsApp conversations.
 * Uses Haiku by default; escalates to Sonnet for complex queries.
 * Queries the real Supabase schema: vehicles, dealerships, users.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { AIContext, AIResponse, AIVehicle } from '@/types/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface GenerateResponseParams {
  dealershipId: string
  conversaId: string
  userMessage: string
  customSystemPrompt?: string
  useSmartModel?: boolean
}

export async function generateAIResponse(params: GenerateResponseParams): Promise<AIResponse> {
  const { dealershipId, conversaId, userMessage, customSystemPrompt, useSmartModel } = params
  const startTime = Date.now()

  const context = await buildContext(dealershipId, conversaId)
  const systemPrompt = customSystemPrompt || buildSystemPrompt(context)
  const messages = buildMessages(context.conversationHistory, userMessage)
  const model = useSmartModel ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages,
    })

    const text = response.content.find(c => c.type === 'text')
    const responseText = text?.text ?? 'Desculpe, não consegui processar sua mensagem.'

    const intent     = extractIntent(userMessage)
    const vehicleIds = extractVehicleReferences(responseText, context.availableVehicles)
    const responseMs = Date.now() - startTime

    await updateLastMessageAI(
      conversaId,
      response.usage.input_tokens,
      response.usage.output_tokens,
      model,
      responseMs
    )

    return {
      message: responseText,
      intent,
      vehicleIds,
      shouldTransferToHuman: shouldTransfer(userMessage),
    }
  } catch (e: unknown) {
    console.error('[WhatsApp AI] generation error:', e)
    return {
      message: 'Desculpe, estou com dificuldades no momento. Um de nossos atendentes entrará em contato em breve.',
      intent: 'erro',
      vehicleIds: [],
      shouldTransferToHuman: true,
    }
  }
}

// ─── Context builder ──────────────────────────────────────────────────────────

async function buildContext(dealershipId: string, conversaId: string): Promise<AIContext> {
  const [
    { data: dealership },
    { data: messages },
    { data: vehicles },
    { data: conversa },
  ] = await Promise.all([
    supabase
      .from('dealerships')
      .select('name, phone, whatsapp, address, city, state')
      .eq('id', dealershipId)
      .single(),

    supabase
      .from('whatsapp_mensagens')
      .select('direcao, conteudo, criado_em')
      .eq('conversa_id', conversaId)
      .order('criado_em', { ascending: false })
      .limit(10),

    supabase
      .from('vehicles')
      .select('id, brand, model, year_model, sale_price, mileage, color')
      .eq('dealership_id', dealershipId)
      .eq('status', 'available')
      .not('sale_price', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('whatsapp_conversas')
      .select('nome_contato, ultima_intencao')
      .eq('id', conversaId)
      .single(),
  ])

  const availableVehicles: AIVehicle[] = (vehicles ?? []).map(v => ({
    id:      v.id,
    brand:   v.brand,
    model:   v.model,
    year:    v.year_model,
    price:   v.sale_price ?? 0,
    mileage: v.mileage,
    color:   v.color,
  }))

  return {
    dealershipName: dealership?.name ?? 'Nossa Loja',
    dealershipInfo: {
      phone:    dealership?.phone,
      whatsapp: dealership?.whatsapp,
      address:  dealership?.address,
      city:     dealership?.city,
      state:    dealership?.state,
    },
    conversationHistory: ((messages ?? []).reverse()).map(m => ({
      role:    m.direcao === 'entrada' ? 'user' as const : 'assistant' as const,
      content: m.conteudo,
    })),
    availableVehicles,
    customerName:   conversa?.nome_contato,
    previousIntent: conversa?.ultima_intencao,
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: AIContext): string {
  const location = [ctx.dealershipInfo.city, ctx.dealershipInfo.state].filter(Boolean).join(', ')
  const contactLine = ctx.dealershipInfo.whatsapp || ctx.dealershipInfo.phone || ''

  const vehicleList = ctx.availableVehicles.slice(0, 15)
    .map(v =>
      `• ${v.brand} ${v.model} ${v.year} — R$ ${Number(v.price).toLocaleString('pt-BR')} — ${Number(v.mileage).toLocaleString('pt-BR')} km${v.color ? ` — ${v.color}` : ''}`
    )
    .join('\n') || 'Nenhum veículo com preço disponível no momento.'

  return `Você é o assistente virtual da ${ctx.dealershipName}, uma revenda de veículos seminovos no Brasil.
${ctx.customerName ? `\nCliente: ${ctx.customerName}` : ''}

PERSONALIDADE:
- Amigável, profissional e objetivo
- Linguagem natural e brasileira (não muito formal)
- Respostas CURTAS (máximo 3-4 frases — é WhatsApp!)
- Use 1-2 emojis por mensagem

INFORMAÇÕES DA LOJA:
${location      ? `📍 ${location}`  : ''}
${contactLine   ? `📞 ${contactLine}` : ''}

VEÍCULOS DISPONÍVEIS:
${vehicleList}

REGRAS:
1. Sobre veículo da lista: informe os dados disponíveis e sugira visita/test drive
2. Preço: informe e convide para negociação presencial
3. Financiamento: trabalhamos com os principais bancos, simule na loja
4. Agendamento: pergunte dia e horário de preferência
5. Fora do escopo: ofereça contato com um vendedor
6. NUNCA invente veículos fora da lista
7. Se não souber, seja honesto

OBJETIVO: Ajudar o cliente, tirar dúvidas e incentivá-lo a visitar ou agendar um test drive.`
}

function buildMessages(
  history: AIContext['conversationHistory'],
  currentMessage: string
): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = history.slice(-6).map(m => ({
    role:    m.role,
    content: m.content,
  }))
  msgs.push({ role: 'user', content: currentMessage })
  return msgs
}

// ─── Intent extraction ────────────────────────────────────────────────────────

function extractIntent(userMessage: string): string {
  const m = userMessage.toLowerCase()
  if (m.includes('preço') || m.includes('valor') || m.includes('quanto'))         return 'consulta_preco'
  if (m.includes('financ') || m.includes('parcela') || m.includes('entrada'))      return 'financiamento'
  if (m.includes('agenda') || m.includes('visita') || m.includes('test drive'))    return 'agendamento'
  if (m.includes('troca') || m.includes('aceita meu'))                             return 'troca_veiculo'
  if (m.includes('disponível') || m.includes('tem ') || m.includes('estoque'))     return 'consulta_estoque'
  if (m.includes('endereço') || m.includes('onde fica') || m.includes('localização')) return 'localizacao'
  if (m.includes('horário') || m.includes('funciona') || m.includes('abre'))       return 'horario'
  return 'conversa_geral'
}

function extractVehicleReferences(response: string, vehicles: AIVehicle[]): string[] {
  return vehicles
    .filter(v => new RegExp(`${v.brand}.*${v.model}`, 'i').test(response))
    .map(v => v.id)
}

function shouldTransfer(userMessage: string): boolean {
  const triggers = ['reclamação','problema grave','falar com gerente','falar com humano',
    'atendente','não estou satisfeito','advogado','procon']
  const m = userMessage.toLowerCase()
  return triggers.some(t => m.includes(t))
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function updateLastMessageAI(
  conversaId: string,
  tokensIn: number,
  tokensOut: number,
  model: string,
  responseMs: number
): Promise<void> {
  // Find the most recently inserted outgoing message for this conversation
  const { data: msgs } = await supabase
    .from('whatsapp_mensagens')
    .select('id')
    .eq('conversa_id', conversaId)
    .eq('direcao', 'saida')
    .order('criado_em', { ascending: false })
    .limit(1)

  if (!msgs || msgs.length === 0) return

  await supabase
    .from('whatsapp_mensagens')
    .update({
      processado_por_ia: true,
      tokens_entrada:    tokensIn,
      tokens_saida:      tokensOut,
      modelo_usado:      model,
      tempo_resposta_ms: responseMs,
    })
    .eq('id', msgs[0].id)
}
