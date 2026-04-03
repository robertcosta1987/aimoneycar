const BASE = 'http://api.fipeapi.com.br/v1'
const KEY = '29a0f22869b3ecca8d2dd4cbbb10e03c'

async function get(path: string) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${KEY}`
  const res = await fetch(url, { next: { revalidate: 3600 } }) // cache 1h
  if (!res.ok) throw new Error(`FIPE API ${res.status}: ${path}`)
  return res.json()
}

/** List all brands for a vehicle type (carros | motos | caminhoes) */
export async function listBrands(type = 'carros') {
  return get(`/${type}`)
}

/** List all models for a brand */
export async function listModels(type = 'carros', brandId: string) {
  return get(`/${type}/${brandId}`)
}

/** List available model years for a model */
export async function listYears(type = 'carros', brandId: string, modelId: string) {
  return get(`/${type}/${brandId}/${modelId}`)
}

/** Get full price info for a specific model year */
export async function getPrice(type = 'carros', brandId: string, modelId: string, modelYearId: string) {
  return get(`/${type}/${brandId}/${modelId}/${modelYearId}`)
}

/** Lookup all years for a FIPE code */
export async function lookupByFipeCode(fipeCode: string) {
  return get(`/fipe/${fipeCode}`)
}

/** Get price for a FIPE code + specific year */
export async function lookupFipeCodeYear(fipeCode: string, modelYearId: string) {
  return get(`/fipe/${fipeCode}/${modelYearId}`)
}

/**
 * High-level helper: search for a car price by brand name + model name + year.
 * Handles the full brand → model → year → price flow automatically.
 * Returns the best match price or null.
 */
export async function searchPrice(brandName: string, modelName: string, year: number, type = 'carros') {
  try {
    const brands: any[] = await listBrands(type)
    const brand = brands.find(b => b.name.toLowerCase().includes(brandName.toLowerCase()))
    if (!brand) return { error: `Marca "${brandName}" não encontrada` }

    const models: any[] = await listModels(type, brand.id)
    const model = models.find(m => m.name.toLowerCase().includes(modelName.toLowerCase()))
    if (!model) return { error: `Modelo "${modelName}" não encontrado na marca ${brand.name}` }

    const years: any[] = await listYears(type, brand.id, model.id_modelo)
    const yearEntry = years.find(y => y.name.startsWith(String(year)))
    if (!yearEntry) {
      // return available years so AI can pick closest
      return { error: `Ano ${year} não disponível`, available_years: years.map(y => y.name) }
    }

    const price = await getPrice(type, brand.id, model.id_modelo, yearEntry.id_modelo_ano)
    return { ...price, brand_name: brand.name, model_name: model.name }
  } catch (e: any) {
    return { error: e.message }
  }
}
