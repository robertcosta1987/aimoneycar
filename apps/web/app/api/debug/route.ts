import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  const result: Record<string, any> = {}

  // 1. Check env vars
  result.env = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }

  // 2. Check auth session
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    result.auth = { userId: user?.id, email: user?.email, error: error?.message }

    if (user) {
      // 3. Read user record with anon client
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('id, name, email, dealership_id, role')
        .eq('id', user.id)
        .single()
      result.userRow = { data: userRow, error: userErr?.message }

      // 4. Read user record with service client
      const svc = createServiceClient()
      const { data: svcUserRow, error: svcUserErr } = await svc
        .from('users')
        .select('id, name, email, dealership_id, role')
        .eq('id', user.id)
        .single()
      result.userRowViaServiceRole = { data: svcUserRow, error: svcUserErr?.message }

      // 5. List all dealerships via service client
      const { data: allDealerships, error: dealErr } = await svc
        .from('dealerships')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
      result.recentDealerships = { data: allDealerships, error: dealErr?.message }
    }
  } catch (e: any) {
    result.exception = e.message
  }

  return NextResponse.json(result, { status: 200 })
}
