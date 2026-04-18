/**
 * lib/ai/cache.ts
 *
 * Thin read/write helpers for the ai_cache table.
 * Always use the service-role client so RLS doesn't block server-side writes.
 *
 * Usage:
 *   const cached = await getCache(svc, dealershipId, 'top-models')
 *   if (cached) return cached
 *   const result = await callClaude(...)
 *   await setCache(svc, dealershipId, 'top-models', result, 24)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the cached JSON value if it exists and hasn't expired, else null.
 */
export async function getCache<T = any>(
  svc: SupabaseClient,
  dealershipId: string,
  cacheKey: string,
): Promise<T | null> {
  const { data } = await svc
    .from('ai_cache')
    .select('result')
    .eq('dealership_id', dealershipId)
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .single()

  return data ? (data.result as T) : null
}

/**
 * Upserts a cache entry with the given TTL in hours.
 */
export async function setCache(
  svc: SupabaseClient,
  dealershipId: string,
  cacheKey: string,
  result: unknown,
  ttlHours: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
  await svc.from('ai_cache').upsert(
    { dealership_id: dealershipId, cache_key: cacheKey, result, expires_at: expiresAt },
    { onConflict: 'dealership_id,cache_key' },
  )
}
