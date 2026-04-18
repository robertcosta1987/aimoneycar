// ===========================================
// Moneycar AI — TypeScript Types
// ===========================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ─── Supabase Database Types ──────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      dealerships: {
        Row: Dealership
        Insert: Omit<Dealership, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Dealership, 'id'>>
      }
      users: {
        Row: User
        Insert: Omit<User, 'created_at' | 'updated_at'>
        Update: Partial<Omit<User, 'id'>>
      }
      vehicles: {
        Row: Vehicle
        Insert: Omit<Vehicle, 'id' | 'created_at' | 'updated_at' | 'days_in_stock'>
        Update: Partial<Omit<Vehicle, 'id' | 'days_in_stock'>>
      }
      expenses: {
        Row: Expense
        Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Expense, 'id'>>
      }
      sales: {
        Row: Sale
        Insert: Omit<Sale, 'id' | 'created_at'>
        Update: Partial<Omit<Sale, 'id'>>
      }
      ai_alerts: {
        Row: AIAlert
        Insert: Omit<AIAlert, 'id' | 'created_at'>
        Update: Partial<Omit<AIAlert, 'id'>>
      }
      ai_conversations: {
        Row: AIConversation
        Insert: Omit<AIConversation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<AIConversation, 'id'>>
      }
      imports: {
        Row: Import
        Insert: Omit<Import, 'id' | 'created_at'>
        Update: Partial<Omit<Import, 'id'>>
      }
    }
    Functions: {
      get_dashboard_stats: {
        Args: { d_id: string }
        Returns: DashboardStats
      }
    }
  }
}

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Dealership {
  id: string
  name: string
  slug: string
  cnpj: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  logo_url: string | null
  plan: 'free' | 'pro' | 'enterprise'
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  dealership_id: string | null
  name: string
  email: string
  phone: string | null
  role: 'owner' | 'manager' | 'salesperson' | 'staff'
  avatar_url: string | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: string
  dealership_id: string
  plate: string | null
  chassis: string | null
  renavam: string | null
  brand: string
  model: string
  version: string | null
  year_fab: number
  year_model: number
  color: string | null
  mileage: number
  fuel: string | null
  transmission: string | null
  purchase_price: number
  sale_price: number | null
  fipe_price: number | null
  min_price: number | null
  status: 'available' | 'returned' | 'sold' | 'consigned'
  purchase_date: string
  sale_date: string | null
  days_in_stock: number
  supplier_name: string | null
  customer_id: string | null
  photos: string[]
  notes: string | null
  source: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  dealership_id: string
  vehicle_id: string | null
  category: string
  description: string | null
  amount: number
  date: string
  vendor_name: string | null
  payment_method: string | null
  receipt_url: string | null
  created_by: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

export interface Sale {
  id: string
  dealership_id: string
  vehicle_id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_cpf: string | null
  sale_price: number
  purchase_price: number
  total_expenses: number
  profit: number | null
  profit_percent: number | null
  payment_method: string
  down_payment: number | null
  financing_bank: string | null
  sale_date: string
  salesperson_id: string | null
  salesperson_name: string | null
  notes: string | null
  created_at: string
}

export interface AIAlert {
  id: string
  dealership_id: string
  vehicle_id: string | null
  type: 'critical' | 'warning' | 'info' | 'success'
  title: string
  message: string
  action: string | null
  action_data: Record<string, unknown> | null
  is_read: boolean
  is_dismissed: boolean
  sent_whatsapp: boolean
  created_at: string
}

export interface AIConversation {
  id: string
  dealership_id: string
  user_id: string | null
  messages: ChatMessage[]
  context: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Import {
  id: string
  dealership_id: string
  filename: string | null
  file_type: string | null
  file_size: number | null
  status: 'pending' | 'processing' | 'complete' | 'error'
  records_imported: number
  errors: unknown[]
  created_by: string | null
  created_at: string
  completed_at: string | null
}

// ─── UI / Business Types ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DashboardStats {
  total_vehicles: number
  available_vehicles: number
  critical_vehicles: number
  avg_days_in_stock: number
  total_expenses: number
  monthly_sales: number
  monthly_revenue: number
  monthly_profit: number
}

export interface VehicleWithExpenses extends Vehicle {
  total_expenses: number
  margin: number
  margin_percent: number
}

export interface ExpenseSummary {
  category: string
  total: number
  count: number
  average: number
}

export type AlertType = 'critical' | 'warning' | 'info' | 'success'

export type VehicleStatus = 'available' | 'returned' | 'sold' | 'consigned'
