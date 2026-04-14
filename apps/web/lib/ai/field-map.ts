import fs from 'fs'
import path from 'path'

// Loaded once at module init (server-side only).
// FIELD_MAP.md lives alongside this file so Vercel bundles it.
let _cache: string | null = null

export function getFieldMap(): string {
  if (_cache) return _cache
  try {
    const mdPath = path.join(process.cwd(), 'lib/ai/FIELD_MAP.md')
    _cache = fs.readFileSync(mdPath, 'utf-8')
  } catch {
    // Fallback: try relative to this file (works in some bundler configs)
    try {
      _cache = fs.readFileSync(path.join(__dirname, 'FIELD_MAP.md'), 'utf-8')
    } catch {
      _cache = '<!-- FIELD_MAP.md não encontrado -->'
    }
  }
  return _cache
}
