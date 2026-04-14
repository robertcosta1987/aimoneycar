'use client'
import { useState, useCallback } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

type ImportResult = {
  imported: number
  parsed: number
  errors: string[]
  sample?: Record<string, any>[]
  debug?: Record<string, any>
}

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [inspection, setInspection] = useState<any>(null)
  const [clearState, setClearState] = useState<'idle' | 'confirm' | 'clearing' | 'done' | 'error'>('idle')
  const [clearError, setClearError] = useState('')

  const handleFile = (f: File) => {
    if (!f) return
    setFile(f)
    setState('idle')
    setResult(null)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const upload = async () => {
    if (!file) return
    setState('uploading')
    setProgress(10)

    try {
      let res: Response

      if (file.size > 4 * 1024 * 1024) {
        // Large file: upload directly to Supabase Storage via browser client (bypasses Vercel's 4.5MB limit)
        const supabase = createClient()
        const storagePath = `${Date.now()}_${file.name}`
        setProgress(20)
        const { error: storageErr } = await supabase.storage
          .from('imports')
          .upload(storagePath, file, { upsert: true })
        if (storageErr) throw new Error(`Falha ao enviar arquivo: ${storageErr.message}`)

        setProgress(65)
        setState('processing')
        res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, filename: file.name, fileType: file.type }),
        })
      } else {
        // Small file: direct FormData upload
        const formData = new FormData()
        formData.append('file', file)
        setProgress(40)
        setState('processing')
        res = await fetch('/api/upload', { method: 'POST', body: formData })
      }

      setProgress(80)
      const data = await res.json()

      if (res.ok) {
        setResult({
          imported: data.vehicles_imported || data.records_imported || 0,
          parsed: data.total_rows_parsed || 0,
          errors: data.errors || [],
          sample: data.sample,
          debug: { ...data.debug, expenses_imported: data.expenses_imported || 0, vehicles_mapped: data.vehicles_mapped || 0 },
        })
        setState('done')
        setProgress(100)
      } else {
        throw new Error(data.error || 'Upload failed')
      }
    } catch (err: any) {
      setState('error')
      setResult({ imported: 0, parsed: 0, errors: [err.message] })
    }
  }

  const clearData = async () => {
    setClearState('clearing')
    setClearError('')
    try {
      const res = await fetch('/api/clear-data', { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Erro ao limpar dados')
      }
      setClearState('done')
      setFile(null)
      setState('idle')
      setResult(null)
    } catch (err: any) {
      setClearError(err.message)
      setClearState('error')
    }
  }

  const inspect = async () => {
    if (!file) return
    setInspecting(true)
    setInspection(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/mdb-inspect', { method: 'POST', body: formData })
      const data = await res.json()
      setInspection(data)
    } catch (e: any) {
      setInspection({ error: e.message })
    }
    setInspecting(false)
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
                {(file.size / 1024).toFixed(0)} KB
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
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">
                {state === 'uploading' ? 'Enviando arquivo...' : 'Processando dados...'}
              </p>
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {state === 'done' && result && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-6 h-6 text-success" />
              <p className="font-semibold text-success">Importação concluída!</p>
            </div>
            <p className="text-sm text-foreground-muted">
              {result.imported} veículos importados de {result.parsed} linhas lidas
              {(result.debug?.vehicles_mapped ?? 0) > 0 && result.debug!.vehicles_mapped !== result.imported && ` (${result.debug!.vehicles_mapped} mapeados)`}.
              {(result.debug?.expenses_imported ?? 0) > 0 && ` · ${result.debug!.expenses_imported} despesas importadas.`}
            </p>
            {result.debug && (
              <p className="text-xs text-foreground-muted mt-2">
                Tabela: <span className="font-medium">{result.debug.targetTable}</span>
                {result.debug.expenseTable && <> · Despesas: <span className="font-medium">{result.debug.expenseTable}</span></>}
                {result.debug.brandMapSize > 0 && <> · Marcas: {result.debug.brandMapSize}</>}
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-warning">⚠️ {e}</p>
                ))}
              </div>
            )}
            {result.sample && result.sample.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-foreground-muted mb-2">Amostra dos primeiros registros importados:</p>
                <div className="space-y-2">
                  {result.sample.map((s, i) => (
                    <div key={i} className="text-xs bg-background rounded-lg p-3 font-mono text-foreground-muted">
                      <span className="text-foreground font-medium">{s.brand} {s.model}</span>
                      {' · '}{s.year_model}/{s.year_fab}
                      {' · '}{s.plate || 'sem placa'}
                      {' · '}compra: {s.purchase_date}
                      {' · '}R$ {s.purchase_price?.toLocaleString('pt-BR')}
                      {s.fuel ? ` · ${s.fuel}` : ''}
                    </div>
                  ))}
                </div>
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
                {result.errors.map((e, i) => <p key={i} className="text-sm text-foreground-muted mt-1">{e}</p>)}
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
            {inspection.error && (
              <p className="text-sm text-danger">{inspection.error}</p>
            )}
            <p className="text-xs text-foreground-muted">
              Tabelas encontradas: <span className="font-medium text-foreground">{inspection.tables?.join(', ')}</span>
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

      {/* Danger zone — Limpar Dados */}
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
              <p className="text-sm font-semibold text-danger">
                ⚠️ Tem certeza? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <Button
                  className="gap-2 bg-danger hover:bg-danger/90 text-white"
                  onClick={clearData}
                >
                  <Trash2 className="w-4 h-4" />
                  Sim, apagar tudo
                </Button>
                <Button variant="outline" onClick={() => setClearState('idle')}>
                  Cancelar
                </Button>
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
              Dados apagados com sucesso. Você já pode importar um novo arquivo.
              <button className="ml-2 text-xs underline text-foreground-muted" onClick={() => setClearState('idle')}>
                fechar
              </button>
            </div>
          )}

          {clearState === 'error' && (
            <div className="flex items-center gap-2 text-sm text-danger">
              <AlertCircle className="w-4 h-4" />
              {clearError}
              <button className="ml-2 text-xs underline" onClick={() => setClearState('idle')}>
                tentar novamente
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
