'use client'
import { useState, useCallback } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ imported: number; parsed: number; errors: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)

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

    const formData = new FormData()
    formData.append('file', file)

    try {
      setProgress(40)
      setState('processing')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      setProgress(80)
      const data = await res.json()

      if (res.ok) {
        setResult({ imported: data.records_imported || 0, parsed: data.total_rows_parsed || 0, errors: data.errors || [] })
        setState('done')
        setProgress(100)
      } else {
        throw new Error(data.error || 'Upload failed')
      }
    } catch (err: any) {
      setState('error')
      setResult({ imported: 0, errors: [err.message] })
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
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

      {/* Upload button */}
      {file && state === 'idle' && (
        <Button onClick={upload} className="gap-2 w-full">
          <Upload className="w-4 h-4" />
          Importar {file.name}
        </Button>
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
              {result.imported} veículos importados de {result.parsed} linhas lidas.
            </p>
            {result.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-warning">⚠️ {e}</p>
                ))}
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
    </div>
  )
}
