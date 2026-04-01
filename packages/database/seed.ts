import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../apps/web/types'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function seed() {
  console.log('🌱 Seeding database...')

  // 1. Create dealership
  const { data: dealership, error: dErr } = await supabase
    .from('dealerships')
    .insert({
      name: 'Revenda Demo',
      slug: 'revenda-demo',
      phone: '11999999999',
      whatsapp: '11999999999',
      email: 'demo@moneycar.ai',
      city: 'São Paulo',
      state: 'SP',
      plan: 'pro',
      settings: {},
    })
    .select()
    .single()

  if (dErr) { console.error('Dealership error:', dErr); return }
  console.log('✅ Dealership created:', dealership.id)

  // 2. Create demo vehicles
  const vehicles = [
    { brand: 'Toyota', model: 'Corolla', year_fab: 2021, year_model: 2022, color: 'Branco', mileage: 42000, purchase_price: 98000, sale_price: 115000, fuel: 'Flex', transmission: 'Automático', purchase_date: '2024-08-01', status: 'available' as const },
    { brand: 'Volkswagen', model: 'Gol', year_fab: 2019, year_model: 2020, color: 'Prata', mileage: 78000, purchase_price: 38000, sale_price: 45000, fuel: 'Flex', transmission: 'Manual', purchase_date: '2024-01-15', status: 'available' as const },
    { brand: 'Chevrolet', model: 'Onix', year_fab: 2022, year_model: 2022, color: 'Preto', mileage: 25000, purchase_price: 72000, sale_price: 85000, fuel: 'Flex', transmission: 'Automático', purchase_date: '2024-09-20', status: 'available' as const },
    { brand: 'Honda', model: 'Civic', year_fab: 2020, year_model: 2021, color: 'Cinza', mileage: 55000, purchase_price: 115000, sale_price: 135000, fuel: 'Flex', transmission: 'Automático', purchase_date: '2023-12-10', status: 'available' as const },
    { brand: 'Ford', model: 'Ka', year_fab: 2018, year_model: 2019, color: 'Vermelho', mileage: 92000, purchase_price: 28000, sale_price: 35000, fuel: 'Flex', transmission: 'Manual', purchase_date: '2024-02-28', status: 'available' as const },
    { brand: 'Hyundai', model: 'HB20', year_fab: 2021, year_model: 2021, color: 'Azul', mileage: 31000, purchase_price: 55000, sale_price: 65000, fuel: 'Flex', transmission: 'Automático', purchase_date: '2024-07-05', status: 'reserved' as const },
  ]

  const { data: insertedVehicles, error: vErr } = await supabase
    .from('vehicles')
    .insert(vehicles.map(v => ({ ...v, dealership_id: dealership.id, photos: [] })))
    .select()

  if (vErr) { console.error('Vehicles error:', vErr); return }
  console.log(`✅ ${insertedVehicles?.length} vehicles created`)

  // 3. Create expenses for first two vehicles
  if (insertedVehicles && insertedVehicles.length >= 2) {
    const expenses = [
      { vehicle_id: insertedVehicles[0].id, category: 'Mecânica', description: 'Revisão completa', amount: 2500, date: '2024-08-05' },
      { vehicle_id: insertedVehicles[0].id, category: 'Estética', description: 'Polimento e higienização', amount: 800, date: '2024-08-06' },
      { vehicle_id: insertedVehicles[1].id, category: 'Mecânica', description: 'Troca de freios', amount: 1200, date: '2024-01-18' },
      { vehicle_id: insertedVehicles[3].id, category: 'Documentação', description: 'Transferência de propriedade', amount: 650, date: '2023-12-12' },
      { vehicle_id: insertedVehicles[3].id, category: 'Mecânica', description: 'Suspensão dianteira', amount: 3200, date: '2023-12-15' },
    ]

    const { error: eErr } = await supabase
      .from('expenses')
      .insert(expenses.map(e => ({ ...e, dealership_id: dealership.id })))

    if (eErr) console.error('Expenses error:', eErr)
    else console.log(`✅ ${expenses.length} expenses created`)
  }

  // 4. Create a sample sale
  if (insertedVehicles && insertedVehicles.length > 0) {
    const { error: sErr } = await supabase.from('sales').insert({
      dealership_id: dealership.id,
      vehicle_id: insertedVehicles[0].id,
      customer_name: 'João Silva',
      customer_phone: '11988887777',
      sale_price: 115000,
      purchase_price: 98000,
      total_expenses: 3300,
      payment_method: 'Financiamento',
      financing_bank: 'Banco do Brasil',
      sale_date: '2024-09-15',
      salesperson_name: 'Pedro Costa',
    })
    if (sErr) console.error('Sale error:', sErr)
    else console.log('✅ Sample sale created')
  }

  console.log('\n🎉 Seed complete!')
  console.log(`Dealership ID: ${dealership.id}`)
}

seed().catch(console.error)
