'use client'
import { useState, useCallback } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader2, Search, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

type ImportResult = {
  imported: number
  errors: string[]
  counts: Record<string, number>
}

// ─── Parse helpers (for client-side inspect only) ────────────────────────────

function parseDate(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) {
    if (isNaN(v.getTime()) || v.getFullYear() < 1990) return null
    return v.toISOString().split('T')[0]
  }
  const s = String(v).trim()
  if (!s || s === 'null') return null
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return parseInt(br[3]) < 1990 ? null : `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return parseInt(s.slice(0, 4)) < 1990 ? null : s.slice(0, 10)
  return null
}

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [statusLabel, setStatusLabel] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [inspection, setInspection] = useState<any>(null)
  const [showCounts, setShowCounts] = useState(false)
  const [clearState, setClearState] = useState<'idle' | 'confirm' | 'clearing' | 'done' | 'error'>('idle')
  const [clearError, setClearError] = useState('')

  const handleFile = (f: File) => {
    setFile(f)
    setState('idle')
    setResult(null)
    setInspection(null)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const isMdb = (f: File) => /\.(mdb|accdb)$/i.test(f.name)

  const upload = async () => {
    if (!file) return
    setState('uploading')
    setProgress(0)

    try {
      if (isMdb(file)) {
        // MDB → upload to Supabase Storage first, then call Azure with the path
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Sessão expirada. Faça login novamente.')

        const azureUrl = process.env.NEXT_PUBLIC_IMPORT_SERVICE_URL
        if (!azureUrl) throw new Error('Serviço de importação não configurado (NEXT_PUBLIC_IMPORT_SERVICE_URL)')

        // Step 1: get presigned upload URL
        setStatusLabel('Preparando upload...')
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        })
        if (!presignRes.ok) throw new Error('Falha ao preparar upload')
        const { path: storagePath, signedUrl } = await presignRes.json()

        // Step 2: upload file to Supabase Storage with progress
        setStatusLabel('Enviando arquivo...')
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 60))
            }
          }
          xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload storage falhou: HTTP ${xhr.status}`))
          xhr.onerror = () => reject(new Error('Falha de rede ao enviar arquivo'))
          xhr.open('PUT', signedUrl)
          xhr.setRequestHeader('Content-Type', 'application/octet-stream')
          xhr.send(file)
        })

        // Step 3: call Azure Function with just the storage path (tiny JSON payload)
        setProgress(65)
        setState('processing')
        setStatusLabel('Processando no servidor...')
        const res = await fetch(azureUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storagePath, filename: file.name }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(err.error ?? `HTTP ${res.status}`)
        }
        const data = await res.json()

        setProgress(100)
        setResult({
          imported: data.total_imported ?? data.records_imported ?? 0,
          errors: data.errors ?? [],
          counts: data.counts ?? {},
        })
        setState('done')

      } else {
        // CSV / JSON → existing /api/upload route
        let res: Response
        setStatusLabel('Enviando arquivo...')

        if (file.size > 4 * 1024 * 1024) {
          const presignRes = await fetch('/api/upload/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name }),
          })
          if (!presignRes.ok) throw new Error('Falha ao gerar token de upload')
          const { path: storagePath, token } = await presignRes.json()
          setProgress(30)
          const supabase = createClient()
          const { error: storageErr } = await supabase.storage.from('imports').uploadToSignedUrl(storagePath, token, file)
          if (storageErr) throw new Error(storageErr.message)
          setProgress(60)
          setState('processing')
          setStatusLabel('Processando...')
          res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePath, filename: file.name, fileType: file.type }),
          })
        } else {
          const formData = new FormData()
          formData.append('file', file)
          setProgress(40)
          setState('processing')
          setStatusLabel('Processando...')
          res = await fetch('/api/upload', { method: 'POST', body: formData })
        }

        setProgress(90)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        setResult({
          imported: data.records_imported ?? 0,
          errors: data.errors ?? [],
          counts: data.counts ?? {},
        })
        setState('done')
        setProgress(100)
      }
    } catch (err: any) {
      setState('error')
      setResult({ imported: 0, errors: [err.message], counts: {} })
    }
  }

  const inspect = async () => {
    if (!file) return
    setInspecting(true)
    setInspection(null)
    try {
      if (isMdb(file)) {
        // Client-side inspect for MDB — read structure without parsing all rows
        const { default: MDBReader } = await import('mdb-reader')
        const buf = Buffer.from(await file.arrayBuffer())
        const reader = new MDBReader(buf)
        const tableNames = reader.getTableNames().filter((t: string) => !t.startsWith('MSys'))
        const samples: Record<string, any> = {}
        for (const table of tableNames) {
          try {
            const rows = reader.getTable(table).getData() as Record<string, any>[]
            if (!rows.length) { samples[table] = { count: 0, columns: [], firstRow: null }; continue }
            const columns = Object.entries(rows[0]).map(([col, val]) => ({
              col,
              type: val instanceof Date ? 'Date' : typeof val,
              value: val instanceof Date
                ? `${val.toISOString().slice(0, 10)} (year: ${val.getFullYear()})`
                : val === null ? 'null' : String(val).slice(0, 80),
            }))
            samples[table] = {
              count: rows.length, columns,
              secondRow: rows[1] ? Object.entries(rows[1]).map(([col, val]) => ({
                col,
                value: val instanceof Date
                  ? `${val.toISOString().slice(0, 10)} (year: ${val.getFullYear()})`
                  : val === null ? 'null' : String(val).slice(0, 80),
              })) : null,
            }
          } catch (e: any) { samples[table] = { error: e.message } }
        }
        setInspection({ tables: tableNames, samples })
      } else {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/mdb-inspect', { method: 'POST', body: formData })
        setInspection(await res.json())
      }
    } catch (e: any) {
      setInspection({ error: e.message })
    }
    setInspecting(false)
  }

  const clearData = async () => {
    setClearState('clearing')
    setClearError('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada. Faça login novamente.')

      const azureBase = process.env.NEXT_PUBLIC_IMPORT_SERVICE_URL
      if (!azureBase) throw new Error('Serviço não configurado')
      const clearUrl = azureBase.replace('importMdb', 'clearData')

      const res = await fetch(clearUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erro ao limpar dados')

      setClearState('done')
      setFile(null)
      setState('idle')
      setResult(null)
    } catch (err: any) {
      setClearError(err.message)
      setClearState('error')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Importar Dados</h1>
        <p className="text-foreground-muted text-sm mt-1">Importe dados do Moneycar (.mdb), Excel (.xlsx) ou CSV</p>
      </div>

      {/* Drop zone */}
      <Card>
        <CardContent className="p-8">
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById('file-input')?.click()}
            className={cn(
              'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200',
              dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-border-hover hover:bg-background-elevated'
            )}
          >
            <input
              id="file-input"
              type="file"
              className="hidden"
              accept=".mdb,.xlsx,.csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Upload className={cn('w-12 h-12 mx-auto mb-4', dragOver ? 'text-primary' : 'text-foreground-muted')} />
            <p className="text-foreground font-medium">
              {file ? file.name : 'Arraste o arquivo aqui ou clique para selecionar'}
            </p>
            <p className="text-xs text-foreground-muted mt-2">Suporta: .mdb (Moneycar), .xlsx, .csv</p>
            {file && (
              <Badge variant="secondary" className="mt-3">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Buttons */}
      {file && state === 'idle' && (
        <div className="flex gap-3">
          <Button onClick={upload} className="gap-2 flex-1">
            <Upload className="w-4 h-4" />
            Importar {file.name}
          </Button>
          <Button onClick={inspect} variant="outline" className="gap-2" disabled={inspecting}>
            {inspecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Inspecionar
          </Button>
        </div>
      )}

      {/* Progress */}
      {(state === 'uploading' || state === 'processing') && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
              <p className="text-sm font-medium text-foreground">{statusLabel}</p>
            </div>
            <Progress value={progress} />
            {state === 'processing' && (
              <p className="text-xs text-foreground-muted">
                O arquivo está sendo processado no servidor. Isso pode levar alguns minutos para arquivos grandes — não feche esta janela.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {state === 'done' && result && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-6 h-6 text-success" />
              <p className="font-semibold text-success">Importação concluída!</p>
            </div>
            <p className="text-sm text-foreground-muted">
              {result.imported.toLocaleString('pt-BR')} registros importados.
              {result.counts.vehicles ? ` · ${result.counts.vehicles} veículos` : ''}
              {result.counts.customers ? ` · ${result.counts.customers} clientes` : ''}
              {result.counts.expenses ? ` · ${result.counts.expenses} despesas` : ''}
            </p>
            {result.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-warning">⚠️ {e}</p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-xs text-foreground-muted">+ {result.errors.length - 5} avisos adicionais</p>
                )}
              </div>
            )}
            {Object.keys(result.counts).length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowCounts(!showCounts)}
                  className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
                >
                  {showCounts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showCounts ? 'Ocultar detalhes' : 'Ver detalhes por tabela'}
                </button>
                {showCounts && (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {Object.entries(result.counts)
                      .filter(([, v]) => v > 0)
                      .sort(([, a], [, b]) => b - a)
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-foreground-muted font-mono">{k}</span>
                          <span className="text-foreground">{v.toLocaleString('pt-BR')}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {state === 'error' && result && (
        <Card className="border-danger/30 bg-danger/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-danger" />
              <div>
                <p className="font-semibold text-danger">Erro na importação</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-sm text-foreground-muted mt-1">{e}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inspection results */}
      {inspection && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              Estrutura do Arquivo MDB
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {inspection.error && <p className="text-sm text-danger">{inspection.error}</p>}
            <p className="text-xs text-foreground-muted">
              Tabelas: <span className="font-medium text-foreground">{inspection.tables?.join(', ')}</span>
            </p>
            {Object.entries(inspection.samples ?? {}).map(([table, info]: [string, any]) => (
              <div key={table}>
                <p className="text-sm font-semibold text-foreground mb-2">
                  📋 {table}
                  <span className="ml-2 text-xs font-normal text-foreground-muted">({info.count} registros)</span>
                </p>
                {info.error ? (
                  <p className="text-xs text-danger">{info.error}</p>
                ) : info.columns ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-1 px-2 text-foreground-muted font-medium">Coluna</th>
                          <th className="text-left py-1 px-2 text-foreground-muted font-medium">Tipo</th>
                          <th className="text-left py-1 px-2 text-foreground-muted font-medium">1º Valor</th>
                          <th className="text-left py-1 px-2 text-foreground-muted font-medium">2º Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.columns.map((col: any, i: number) => {
                          const second = info.secondRow?.find((r: any) => r.col === col.col)
                          return (
                            <tr key={i} className="border-b border-border/50 hover:bg-background-elevated">
                              <td className="py-1 px-2 font-mono text-primary font-medium">{col.col}</td>
                              <td className="py-1 px-2 text-foreground-subtle">{col.type}</td>
                              <td className="py-1 px-2 text-foreground max-w-[200px] truncate">{col.value}</td>
                              <td className="py-1 px-2 text-foreground-muted max-w-[200px] truncate">{second?.value ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Como Exportar do Moneycar</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-foreground-muted">
            <li><span className="text-foreground font-medium">1.</span> Abra o Moneycar software</li>
            <li><span className="text-foreground font-medium">2.</span> Vá em Arquivo → Exportar Dados</li>
            <li><span className="text-foreground font-medium">3.</span> Selecione o formato .mdb ou .xlsx</li>
            <li><span className="text-foreground font-medium">4.</span> Salve o arquivo e importe aqui</li>
          </ol>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-danger/30">
        <CardHeader>
          <CardTitle className="text-base text-danger flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Zona de Perigo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground-muted">
            Apaga <strong>todos os veículos, despesas, clientes, financiamentos, multas e alertas</strong> da sua loja.
            Use antes de importar um arquivo atualizado do zero.
          </p>

          {clearState === 'idle' && (
            <Button
              variant="outline"
              className="gap-2 border-danger/40 text-danger hover:bg-danger/5 hover:border-danger"
              onClick={() => setClearState('confirm')}
            >
              <Trash2 className="w-4 h-4" />
              Limpar Dados
            </Button>
          )}

          {clearState === 'confirm' && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-danger">⚠️ Tem certeza? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <Button className="gap-2 bg-danger hover:bg-danger/90 text-white" onClick={clearData}>
                  <Trash2 className="w-4 h-4" />
                  Sim, apagar tudo
                </Button>
                <Button variant="outline" onClick={() => setClearState('idle')}>Cancelar</Button>
              </div>
            </div>
          )}

          {clearState === 'clearing' && (
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="w-4 h-4 animate-spin text-danger" />
              Apagando dados...
            </div>
          )}

          {clearState === 'done' && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle className="w-4 h-4" />
              Dados apagados com sucesso.
              <button className="ml-2 text-xs underline text-foreground-muted" onClick={() => setClearState('idle')}>fechar</button>
            </div>
          )}

          {clearState === 'error' && (
            <div className="flex items-center gap-2 text-sm text-danger">
              <AlertCircle className="w-4 h-4" />
              {clearError}
              <button className="ml-2 text-xs underline" onClick={() => setClearState('idle')}>tentar novamente</button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
