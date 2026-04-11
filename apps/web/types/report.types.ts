/**
 * types/report.types.ts
 *
 * All TypeScript interfaces for the Executive Report feature.
 *
 * Assumptions documented:
 * - Financing installment-plan data (36x/48x/60x) is not stored in the
 *   current schema; financing is identified by payment_method and
 *   summarised by financing_bank.
 * - "ROI" is computed as: totalProfit / totalPurchaseCost × 100
 * - Period breakdowns: weekly→daily, monthly→weekly, quarterly/annual→monthly
 */

// ─── Core ─────────────────────────────────────────────────────────────────────

export type ReportType = 'weekly' | 'monthly' | 'quarterly' | 'annual'

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  weekly:    'Semanal',
  monthly:   'Mensal',
  quarterly: 'Trimestral',
  annual:    'Anual',
}

export interface ReportPeriod {
  type: ReportType
  label: string       // "March 2026" / "Week of 01/03/2026"
  start: string       // ISO date  "2026-03-01"
  end: string         // ISO date  "2026-03-31"
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  label: string       // "Jan", "Sem 1", "03/03"
  revenue: number
  profit: number
  expenses: number
  margin: number      // %
  units: number
}

export interface MarginPoint {
  label: string
  margin: number
}

// ─── Section 4.2 — Financial Overview ────────────────────────────────────────

export interface FinancialOverview {
  totalRevenue: number
  totalProfit: number
  totalExpenses: number
  avgMargin: number   // %
  roi: number         // %
  chartData: TimeSeriesPoint[]
  marginTrend: MarginPoint[]
}

// ─── Section 4.3 — Sales Performance ─────────────────────────────────────────

export interface SaleVehicleRow {
  id: string
  name: string        // "FORD KA 2021"
  plate: string | null
  purchasePrice: number
  salePrice: number
  totalExpenses: number
  profit: number
  margin: number      // %
  daysToSell: number
  saleDate: string
}

export interface SalesPerformance {
  totalSold: number
  avgDaysToSell: number
  fastestSale: { name: string; plate: string | null; days: number } | null
  slowestSale:  { name: string; plate: string | null; days: number } | null
  topProfitable:   SaleVehicleRow[]
  bottomMargin:    SaleVehicleRow[]
  unitsByPeriod:   Array<{ label: string; units: number }>
}

// ─── Section 4.4 — Inventory Health ──────────────────────────────────────────

export interface InventoryVehicleRow {
  id: string
  name: string
  plate: string | null
  daysInStock: number
  salePrice: number | null
  purchasePrice: number
}

export interface AgingBucket {
  label: string
  count: number
  color: string
}

export interface InventoryHealth {
  totalInStock: number
  avgDaysInStock: number
  attentionVehicles: InventoryVehicleRow[]   // 30–60 days
  criticalVehicles:  InventoryVehicleRow[]   // >60 days
  missingPriceVehicles: InventoryVehicleRow[] // sale_price = 0 / null
  agingDistribution: AgingBucket[]
}

// ─── Section 4.5 — Expense Breakdown ─────────────────────────────────────────

export interface ExpenseCategoryRow {
  category: string
  total: number
  percentage: number  // % of total
  count: number
}

export interface LargestExpenseItem {
  description: string
  category: string
  amount: number
  vehicleName: string | null
}

export interface ExpenseBreakdown {
  totalExpenses: number
  byCategory: ExpenseCategoryRow[]
  avgPerVehicleSold: number
  largestItem: LargestExpenseItem | null
}

// ─── Section 4.6 — Financing Overview ────────────────────────────────────────

export interface FinancingByBank {
  bank: string
  count: number
  totalAmount: number
}

export interface FinancingOverview {
  totalContracts: number
  totalFinancedAmount: number
  cashCount: number
  cashAmount: number
  byBank: FinancingByBank[]
  missingDataContracts: number
  // NOTE: installment plan (36x/48x/60x) not available in current schema
}

// ─── Section 4.7 — Operational Metrics ───────────────────────────────────────

export interface InflowOutflowPoint {
  label: string
  acquired: number
  sold: number
}

export interface OperationalMetrics {
  turnoverRate: number            // units sold / avg inventory
  bestPeriod: { label: string; units: number }
  inflow: InflowOutflowPoint[]
}

// ─── Section 4.8 — Alerts & Recommendations ──────────────────────────────────

export type AlertLevel = 'red' | 'yellow' | 'green'

export interface AlertRecommendation {
  level: AlertLevel
  icon: string
  message: string
  recommendation: string
}

// ─── Full report data ─────────────────────────────────────────────────────────

export interface ExecutiveReportData {
  dealershipName: string
  dealershipAddress: string | null
  period: ReportPeriod
  executiveSummary: string
  financial: FinancialOverview
  sales: SalesPerformance
  inventory: InventoryHealth
  expenses: ExpenseBreakdown
  financing: FinancingOverview
  operational: OperationalMetrics
  alerts: AlertRecommendation[]
  generatedAt: string
}

// ─── DB record (what's stored in executive_reports table) ────────────────────

export interface ExecutiveReport {
  id: string
  dealership_id: string
  type: ReportType
  period_label: string
  period_start: string
  period_end: string
  data: ExecutiveReportData
  generated_at: string
  triggered_by: 'manual' | 'scheduled'
  created_at: string
}

// ─── Schedule settings ────────────────────────────────────────────────────────

export interface WeeklyDeliveryConfig {
  day: number    // 0=Sun … 6=Sat
}

export interface MonthlyDeliveryConfig {
  day: number    // 1–28
}

export interface QuarterlyDeliveryConfig {
  month: number  // 0-based month of quarter start (0=Jan, 3=Apr, 6=Jul, 9=Oct)
  day: number
}

export interface AnnualDeliveryConfig {
  month: number  // 0-based
  day: number
}

export interface DeliveryConfig {
  weekly?:    WeeklyDeliveryConfig
  monthly?:   MonthlyDeliveryConfig
  quarterly?: QuarterlyDeliveryConfig
  annual?:    AnnualDeliveryConfig
}

export interface ReportSchedule {
  id?: string
  dealership_id?: string
  enabled: boolean
  recipientEmails: string[]
  reportTypes: ReportType[]
  deliveryConfig: DeliveryConfig
  includeAttachment: boolean
  emailSubject: string
  emailBody: string
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export interface GenerateReportRequest {
  type: ReportType
}

export interface GenerateReportResponse {
  report: ExecutiveReport
}

export interface ListReportsResponse {
  reports: ExecutiveReport[]
}

// Day-of-week labels
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Month labels (pt-BR)
export const MONTHS_BR = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
export const MONTHS_SHORT = [
  'Jan','Fev','Mar','Abr','Mai','Jun',
  'Jul','Ago','Set','Out','Nov','Dez',
]
