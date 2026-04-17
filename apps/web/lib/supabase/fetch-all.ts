/**
 * Fetches all rows from a Supabase query, bypassing the default 1000-row limit.
 * Works with both server and client Supabase instances.
 *
 * Usage:
 *   const rows = await fetchAll(supabase.from('vehicles').select('id').eq('dealership_id', d))
 */
export async function fetchAll<T = any>(query: any): Promise<T[]> {
  const PAGE = 1000
  const results: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    results.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return results
}
