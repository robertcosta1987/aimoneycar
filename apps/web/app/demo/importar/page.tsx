'use client'

import { useState, useRef } from 'react'
import {
  Upload,
  FileText,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type ImportStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error'

export default function ImportarPage() {
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f)
    simulateUpload()
  }

  const simulateUpload = () => {
    setStatus('uploading')
    setProgress(0)
    const uploadInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(uploadInterval)
          setStatus('processing')
          simulateProcessing()
          return 100
        }
        return prev + 10
      })
    }, 200)
  }

  const simulateProcessing = () => {
    setProgress(0)
    const processInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(processInterval)
          setStatus('complete')
          return 100
        }
        return prev + 5
      })
    }, 300)
  }

  const resetUpload = () => {
    setStatus('idle')
    setProgress(0)
    setFile(null)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFile(dropped)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar Dados</h1>
        <p className="text-muted-foreground">
          Conecte seus dados do Moneycar para ativar a inteligência artificial
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-violet-500" />
            Importar do Moneycar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'idle' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragActive(true) }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                  : 'border-gray-200 hover:border-violet-300 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-slate-800'
              )}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".mdb,.accdb,.csv,.xls,.xlsx,.json"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
                  <Upload className="h-8 w-8 text-violet-600" />
                </div>
                <div>
                  <p className="text-lg font-medium">
                    {isDragActive ? 'Solte o arquivo aqui...' : 'Arraste o arquivo do Moneycar'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Suporta .mdb, .accdb, .csv, .xlsx
                  </p>
                </div>
                <Button variant="outline" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>
                  <FileText className="mr-2 h-4 w-4" />
                  Selecionar Arquivo
                </Button>
              </div>
            </div>
          )}

          {status === 'uploading' && (
            <div className="py-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-violet-500 mx-auto" />
              <p className="text-lg font-medium mt-4">Enviando arquivo...</p>
              <p className="text-sm text-muted-foreground">{file?.name}</p>
              <Progress value={progress} className="max-w-md mx-auto mt-4" />
              <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
            </div>
          )}

          {status === 'processing' && (
            <div className="py-12 text-center">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-violet-500 mx-auto" />
                <Database className="h-5 w-5 text-violet-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-lg font-medium mt-4">Processando dados...</p>
              <p className="text-sm text-muted-foreground">Extraindo veículos, despesas e transações</p>
              <Progress value={progress} className="max-w-md mx-auto mt-4" />
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Badge variant="secondary">68 veículos</Badge>
                <Badge variant="secondary">735 despesas</Badge>
                <Badge variant="secondary">700+ transações</Badge>
              </div>
            </div>
          )}

          {status === 'complete' && (
            <div className="py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg font-medium mt-4">Importação concluída!</p>
              <p className="text-sm text-muted-foreground">Seus dados foram processados e a IA está pronta</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Badge variant="success">68 veículos importados</Badge>
                <Badge variant="success">735 despesas processadas</Badge>
                <Badge variant="success">IA ativada</Badge>
              </div>
              <div className="flex justify-center gap-3 mt-6">
                <Button variant="outline" onClick={resetUpload}>Importar outro arquivo</Button>
                <Button variant="gradient" asChild>
                  <a href="/demo">
                    Ver Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Como exportar do Moneycar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { n: 1, title: 'Abra o Moneycar', desc: 'Vá em Menu → Ferramentas → Backup' },
              { n: 2, title: 'Gere o backup', desc: 'Selecione "Backup Completo" e salve o arquivo .mdb' },
              { n: 3, title: 'Importe aqui', desc: 'Arraste o arquivo para a área acima' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-medium text-violet-600">{n}</span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados que importamos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {['Veículos (estoque completo)', 'Despesas por veículo', 'Histórico de vendas', 'Clientes e fornecedores', 'Transações financeiras'].map(item => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50 dark:bg-slate-800/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Seus dados estão seguros</p>
              <p className="text-sm text-muted-foreground">
                Os dados são processados de forma segura e criptografada.
                Nunca compartilhamos suas informações com terceiros.
                Você pode excluir seus dados a qualquer momento.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
