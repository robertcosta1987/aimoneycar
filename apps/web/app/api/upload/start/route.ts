import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
  if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const { filename, fileType, fileSize } = await req.json()

  const { data, error } = await svc
    .from('imports')
    .insert({
      dealership_id: profile.dealership_id,
      filename: filename ?? 'upload',
      file_type: fileType ?? 'application/octet-stream',
      file_size: fileSize ?? 0,
      status: 'processing',
      records_imported: 0,
      errors: [],
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ importId: (data as any).id, dealershipId: profile.dealership_id })
}
