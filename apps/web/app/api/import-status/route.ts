import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const importId = req.nextUrl.searchParams.get('importId')
  if (!importId) return NextResponse.json({ error: 'Missing importId' }, { status: 400 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('imports')
    .select('id, status, records_imported, errors, completed_at')
    .eq('id', importId)
    .eq('created_by', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}
