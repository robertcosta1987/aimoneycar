// Demo data based on Stopcar Veículos database analysis
// Location: Praia Grande / São Vicente (Baixada Santista, SP)

export interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  yearModel: number;
  color: string;
  km: number;
  fuel: string;
  transmission: string;
  purchasePrice: number;
  purchaseDate: string;
  salePrice: number;
  soldPrice?: number;
  soldDate?: string;
  status: 'available' | 'returned' | 'sold';
  daysInStock: number;
  expenses: VehicleExpense[];
  totalExpenses: number;
  margin: number;
  marginPercent: number;
  photos: string[];
}

export interface VehicleExpense {
  id: string;
  category: string;
  description: string;
  value: number;
  date: string;
  vendor?: string;
}

export interface DashboardStats {
  totalVehicles: number;
  availableVehicles: number;
  returnedVehicles: number;
  soldThisMonth: number;
  totalInventoryValue: number;
  averageMargin: number;
  averageDaysInStock: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  alertsCount: number;
}

export interface Alert {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  vehicleId?: string;
  action?: string;
  createdAt: string;
}

export interface ExpenseCategory {
  category: string;
  total: number;
  count: number;
  average: number;
  trend: 'up' | 'down' | 'stable';
}

// Vehicle inventory based on Stopcar data patterns
export const vehicles: Vehicle[] = [
  {
    id: 'v1',
    plate: 'FUT-8A23',
    brand: 'Volkswagen',
    model: 'Gol',
    version: '1.0 MPI',
    year: 2019,
    yearModel: 2020,
    color: 'Branco',
    km: 45000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 35000,
    purchaseDate: '2026-01-15',
    salePrice: 42900,
    status: 'available',
    daysInStock: 67,
    expenses: [
      { id: 'e1', category: 'Despachante', description: 'Transferência', value: 420, date: '2026-01-16', vendor: 'Brisamar Despachante' },
      { id: 'e2', category: 'Cartório', description: 'Reconhecimento', value: 85, date: '2026-01-16' },
      { id: 'e3', category: 'Lavagem', description: 'Lavagem completa', value: 45, date: '2026-01-17' },
      { id: 'e4', category: 'Funilaria', description: 'Retoque pintura', value: 800, date: '2026-01-20' },
      { id: 'e5', category: 'IPVA', description: 'Proporcional', value: 320, date: '2026-01-18' },
    ],
    totalExpenses: 1670,
    margin: 6230,
    marginPercent: 14.5,
    photos: [],
  },
  {
    id: 'v2',
    plate: 'EJL-5B47',
    brand: 'Hyundai',
    model: 'HB20',
    version: '1.0 Comfort',
    year: 2020,
    yearModel: 2021,
    color: 'Prata',
    km: 38000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 48000,
    purchaseDate: '2026-02-10',
    salePrice: 56900,
    status: 'available',
    daysInStock: 45,
    expenses: [
      { id: 'e6', category: 'Despachante', description: 'Transferência', value: 420, date: '2026-02-11', vendor: 'Brisamar Despachante' },
      { id: 'e7', category: 'Lavagem', description: 'Lavagem + Polimento', value: 120, date: '2026-02-12' },
      { id: 'e8', category: 'Revisão', description: 'Óleo + Filtros', value: 380, date: '2026-02-15' },
    ],
    totalExpenses: 920,
    margin: 7980,
    marginPercent: 14.0,
    photos: [],
  },
  {
    id: 'v3',
    plate: 'FIM-3C19',
    brand: 'Chevrolet',
    model: 'Onix',
    version: '1.0 LT',
    year: 2021,
    yearModel: 2022,
    color: 'Cinza',
    km: 28000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 55000,
    purchaseDate: '2026-02-20',
    salePrice: 64900,
    status: 'returned',
    daysInStock: 35,
    expenses: [
      { id: 'e9', category: 'Despachante', description: 'Transferência', value: 450, date: '2026-02-21', vendor: 'Brisamar Despachante' },
      { id: 'e10', category: 'Lavagem', description: 'Lavagem simples', value: 35, date: '2026-02-22' },
    ],
    totalExpenses: 485,
    margin: 9415,
    marginPercent: 14.5,
    photos: [],
  },
  {
    id: 'v4',
    plate: 'DTP-7D82',
    brand: 'Fiat',
    model: 'Argo',
    version: '1.0 Drive',
    year: 2020,
    yearModel: 2021,
    color: 'Vermelho',
    km: 42000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 52000,
    purchaseDate: '2026-02-28',
    salePrice: 61900,
    status: 'available',
    daysInStock: 28,
    expenses: [
      { id: 'e11', category: 'Despachante', description: 'Transferência', value: 420, date: '2026-03-01', vendor: 'Brisamar Despachante' },
      { id: 'e12', category: 'Pneu', description: '2 pneus dianteiros', value: 600, date: '2026-03-03' },
      { id: 'e13', category: 'Lavagem', description: 'Lavagem completa', value: 45, date: '2026-03-02' },
    ],
    totalExpenses: 1065,
    margin: 8835,
    marginPercent: 14.3,
    photos: [],
  },
  {
    id: 'v5',
    plate: 'DTQ-4E56',
    brand: 'Honda',
    model: 'Fit',
    version: '1.5 EX CVT',
    year: 2019,
    yearModel: 2020,
    color: 'Azul',
    km: 52000,
    fuel: 'Flex',
    transmission: 'Automático',
    purchasePrice: 62000,
    purchaseDate: '2026-02-05',
    salePrice: 72900,
    status: 'available',
    daysInStock: 52,
    expenses: [
      { id: 'e14', category: 'Despachante', description: 'Transferência', value: 480, date: '2026-02-06', vendor: 'Brisamar Despachante' },
      { id: 'e15', category: 'Cartório', description: 'Autenticações', value: 65, date: '2026-02-06' },
      { id: 'e16', category: 'Lavagem', description: 'Lavagem + Cera', value: 80, date: '2026-02-08' },
      { id: 'e17', category: 'Mecânica', description: 'Pastilha de freio', value: 280, date: '2026-02-10' },
    ],
    totalExpenses: 905,
    margin: 9995,
    marginPercent: 13.7,
    photos: [],
  },
  {
    id: 'v6',
    plate: 'KOW-2F91',
    brand: 'Renault',
    model: 'Sandero',
    version: '1.0 Zen',
    year: 2020,
    yearModel: 2020,
    color: 'Branco',
    km: 35000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 42000,
    purchaseDate: '2026-03-10',
    salePrice: 49900,
    status: 'available',
    daysInStock: 18,
    expenses: [
      { id: 'e18', category: 'Despachante', description: 'Transferência', value: 380, date: '2026-03-11', vendor: 'Brisamar Despachante' },
      { id: 'e19', category: 'Lavagem', description: 'Lavagem simples', value: 35, date: '2026-03-12' },
    ],
    totalExpenses: 415,
    margin: 7485,
    marginPercent: 15.0,
    photos: [],
  },
  {
    id: 'v7',
    plate: 'FHG-8G34',
    brand: 'Nissan',
    model: 'Versa',
    version: '1.6 SV CVT',
    year: 2020,
    yearModel: 2021,
    color: 'Prata',
    km: 48000,
    fuel: 'Flex',
    transmission: 'Automático',
    purchasePrice: 58000,
    purchaseDate: '2026-02-12',
    salePrice: 68900,
    status: 'available',
    daysInStock: 48,
    expenses: [
      { id: 'e20', category: 'Despachante', description: 'Transferência', value: 450, date: '2026-02-13', vendor: 'Brisamar Despachante' },
      { id: 'e21', category: 'Laudo', description: 'Vistoria cautelar', value: 150, date: '2026-02-14' },
      { id: 'e22', category: 'Lavagem', description: 'Lavagem + Higienização', value: 180, date: '2026-02-15' },
    ],
    totalExpenses: 780,
    margin: 10120,
    marginPercent: 14.7,
    photos: [],
  },
  {
    id: 'v8',
    plate: 'ETO-5H67',
    brand: 'Fiat',
    model: 'Palio',
    version: '1.0 Attractive',
    year: 2017,
    yearModel: 2017,
    color: 'Preto',
    km: 78000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 28000,
    purchaseDate: '2026-01-25',
    salePrice: 34900,
    soldPrice: 33500,
    soldDate: '2026-03-15',
    status: 'sold',
    daysInStock: 49,
    expenses: [
      { id: 'e23', category: 'Despachante', description: 'Transferência', value: 350, date: '2026-01-26', vendor: 'Brisamar Despachante' },
      { id: 'e24', category: 'Funilaria', description: 'Reparo para-choque', value: 450, date: '2026-01-28' },
      { id: 'e25', category: 'Lavagem', description: 'Lavagem completa', value: 45, date: '2026-01-30' },
    ],
    totalExpenses: 845,
    margin: 4655,
    marginPercent: 13.9,
    photos: [],
  },
  {
    id: 'v9',
    plate: 'FFT-9I12',
    brand: 'Chevrolet',
    model: 'Prisma',
    version: '1.4 LT',
    year: 2019,
    yearModel: 2019,
    color: 'Branco',
    km: 55000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 45000,
    purchaseDate: '2026-02-18',
    salePrice: 52900,
    status: 'available',
    daysInStock: 38,
    expenses: [
      { id: 'e26', category: 'Despachante', description: 'Transferência', value: 420, date: '2026-02-19', vendor: 'Brisamar Despachante' },
      { id: 'e27', category: 'Combustível', description: 'Abastecimento', value: 150, date: '2026-02-20' },
      { id: 'e28', category: 'Lavagem', description: 'Lavagem simples', value: 35, date: '2026-02-20' },
    ],
    totalExpenses: 605,
    margin: 7295,
    marginPercent: 13.8,
    photos: [],
  },
  {
    id: 'v10',
    plate: 'PLI-3J45',
    brand: 'Chevrolet',
    model: 'S10',
    version: '2.8 LTZ 4x4 Diesel',
    year: 2020,
    yearModel: 2021,
    color: 'Preto',
    km: 68000,
    fuel: 'Diesel',
    transmission: 'Automático',
    purchasePrice: 165000,
    purchaseDate: '2026-03-01',
    salePrice: 189900,
    status: 'returned',
    daysInStock: 25,
    expenses: [
      { id: 'e29', category: 'Despachante', description: 'Transferência', value: 650, date: '2026-03-02', vendor: 'Brisamar Despachante' },
      { id: 'e30', category: 'Revisão', description: 'Troca de óleo diesel', value: 850, date: '2026-03-05' },
      { id: 'e31', category: 'Lavagem', description: 'Lavagem completa', value: 80, date: '2026-03-03' },
      { id: 'e32', category: 'Polimento', description: 'Polimento cristalizado', value: 350, date: '2026-03-06' },
    ],
    totalExpenses: 1930,
    margin: 22970,
    marginPercent: 12.1,
    photos: [],
  },
  {
    id: 'v11',
    plate: 'MWG-6K78',
    brand: 'Volkswagen',
    model: 'Gol',
    version: '1.6 MSI',
    year: 2018,
    yearModel: 2019,
    color: 'Cinza',
    km: 62000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 38000,
    purchaseDate: '2026-01-08',
    salePrice: 45900,
    soldPrice: 44500,
    soldDate: '2026-02-28',
    status: 'sold',
    daysInStock: 51,
    expenses: [
      { id: 'e33', category: 'Despachante', description: 'Transferência', value: 400, date: '2026-01-09', vendor: 'Brisamar Despachante' },
      { id: 'e34', category: 'Elétrica', description: 'Bateria nova', value: 480, date: '2026-01-12' },
      { id: 'e35', category: 'Lavagem', description: 'Lavagem + Cera', value: 80, date: '2026-01-10' },
    ],
    totalExpenses: 960,
    margin: 5540,
    marginPercent: 12.4,
    photos: [],
  },
  {
    id: 'v12',
    plate: 'EPY-2L90',
    brand: 'Honda',
    model: 'Fit',
    version: '1.5 DX',
    year: 2018,
    yearModel: 2018,
    color: 'Prata',
    km: 72000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchasePrice: 52000,
    purchaseDate: '2026-02-25',
    salePrice: 59900,
    soldPrice: 58000,
    soldDate: '2026-03-20',
    status: 'sold',
    daysInStock: 23,
    expenses: [
      { id: 'e36', category: 'Despachante', description: 'Transferência', value: 420, date: '2026-02-26', vendor: 'Brisamar Despachante' },
      { id: 'e37', category: 'Lavagem', description: 'Lavagem completa', value: 45, date: '2026-02-27' },
    ],
    totalExpenses: 465,
    margin: 5535,
    marginPercent: 9.5,
    photos: [],
  },
];

// Calculate dashboard stats
export function getDashboardStats(): DashboardStats {
  const availableVehicles = vehicles.filter((v) => v.status === 'available');
  const returnedVehicles = vehicles.filter((v) => v.status === 'returned');
  const soldVehicles = vehicles.filter((v) => v.status === 'sold');

  // Calculate totals
  const totalInventoryValue = availableVehicles.reduce(
    (sum, v) => sum + v.salePrice,
    0
  );
  const monthlyRevenue = soldVehicles.reduce(
    (sum, v) => sum + (v.soldPrice || 0),
    0
  );
  const monthlyProfit = soldVehicles.reduce((sum, v) => sum + v.margin, 0);
  const averageMargin =
    vehicles.reduce((sum, v) => sum + v.marginPercent, 0) / vehicles.length;
  const averageDaysInStock =
    availableVehicles.reduce((sum, v) => sum + v.daysInStock, 0) /
    (availableVehicles.length || 1);

  // Count alerts (vehicles over 45 days)
  const alertsCount = availableVehicles.filter((v) => v.daysInStock > 45).length;

  return {
    totalVehicles: vehicles.length,
    availableVehicles: availableVehicles.length,
    returnedVehicles: returnedVehicles.length,
    soldThisMonth: soldVehicles.length,
    totalInventoryValue,
    averageMargin,
    averageDaysInStock: Math.round(averageDaysInStock),
    monthlyRevenue,
    monthlyProfit,
    alertsCount,
  };
}

// Get alerts based on vehicle data
export function getAlerts(): Alert[] {
  const alerts: Alert[] = [];

  // Vehicles over 60 days - danger
  vehicles
    .filter((v) => v.status === 'available' && v.daysInStock >= 60)
    .forEach((v) => {
      alerts.push({
        id: `alert-danger-${v.id}`,
        type: 'danger',
        title: `${v.brand} ${v.model} parado há ${v.daysInStock} dias`,
        message: `Sugestão: Baixar ${formatCurrencyShort(v.salePrice * 0.05)} (5%) para acelerar venda`,
        vehicleId: v.id,
        action: 'Ajustar preço',
        createdAt: new Date().toISOString(),
      });
    });

  // Vehicles 45-60 days - warning
  vehicles
    .filter(
      (v) => v.status === 'available' && v.daysInStock >= 45 && v.daysInStock < 60
    )
    .forEach((v) => {
      alerts.push({
        id: `alert-warning-${v.id}`,
        type: 'warning',
        title: `${v.brand} ${v.model} há ${v.daysInStock} dias em estoque`,
        message: 'Considere investir em polimento ou melhorar fotos do anúncio',
        vehicleId: v.id,
        action: 'Ver detalhes',
        createdAt: new Date().toISOString(),
      });
    });

  // Expense alert
  alerts.push({
    id: 'alert-expense-1',
    type: 'info',
    title: 'Despesas com despachante 32% acima da média',
    message:
      'Você gastou R$4.200 com Brisamar Despachante. Considere renegociar valores.',
    action: 'Ver análise',
    createdAt: new Date().toISOString(),
  });

  // Success alert for recent sale
  alerts.push({
    id: 'alert-success-1',
    type: 'success',
    title: 'Honda Fit vendido com margem de 9,5%',
    message: 'Venda concluída em 23 dias. Bom giro de estoque!',
    createdAt: new Date().toISOString(),
  });

  return alerts;
}

// Get expense analysis
export function getExpenseAnalysis(): ExpenseCategory[] {
  const categoryMap = new Map<
    string,
    { total: number; count: number; values: number[] }
  >();

  vehicles.forEach((v) => {
    v.expenses.forEach((e) => {
      const existing = categoryMap.get(e.category) || {
        total: 0,
        count: 0,
        values: [],
      };
      existing.total += e.value;
      existing.count += 1;
      existing.values.push(e.value);
      categoryMap.set(e.category, existing);
    });
  });

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count,
      average: Math.round(data.total / data.count),
      trend: (category === 'Despachante' ? 'up' : 'stable') as 'up' | 'down' | 'stable',
    }))
    .sort((a, b) => b.total - a.total);
}

// Get vehicles by days in stock
export function getVehiclesByAge(): { label: string; count: number; color: string }[] {
  const available = vehicles.filter((v) => v.status === 'available');

  return [
    {
      label: '0-30 dias',
      count: available.filter((v) => v.daysInStock <= 30).length,
      color: '#00E676',
    },
    {
      label: '31-45 dias',
      count: available.filter((v) => v.daysInStock > 30 && v.daysInStock <= 45)
        .length,
      color: '#FFB800',
    },
    {
      label: '46-60 dias',
      count: available.filter((v) => v.daysInStock > 45 && v.daysInStock <= 60)
        .length,
      color: '#FF9100',
    },
    {
      label: '60+ dias',
      count: available.filter((v) => v.daysInStock > 60).length,
      color: '#FF5252',
    },
  ];
}

// Monthly sales data for chart
export function getMonthlySalesData() {
  return [
    { month: 'Out', vendas: 5, faturamento: 245000, lucro: 32000 },
    { month: 'Nov', vendas: 7, faturamento: 312000, lucro: 41000 },
    { month: 'Dez', vendas: 9, faturamento: 425000, lucro: 58000 },
    { month: 'Jan', vendas: 6, faturamento: 285000, lucro: 38000 },
    { month: 'Fev', vendas: 8, faturamento: 368000, lucro: 49000 },
    { month: 'Mar', vendas: 3, faturamento: 136000, lucro: 15700 },
  ];
}

// Helper for short currency format
function formatCurrencyShort(value: number): string {
  if (value >= 1000) {
    return `R$${(value / 1000).toFixed(0)}k`;
  }
  return `R$${value}`;
}

// AI Chat suggested prompts
export const suggestedPrompts = [
  'Qual foi meu lucro este mês?',
  'Quais carros estão parados há mais tempo?',
  'Quanto gastei com despachante?',
  'Qual é minha margem média?',
  'Me dê 3 ações para melhorar as vendas',
  'Compare minhas despesas com o mercado',
];

// Vehicle models for filters
export const vehicleModels = [
  'Gol',
  'HB20',
  'Onix',
  'Argo',
  'Fit',
  'Sandero',
  'Versa',
  'Palio',
  'Prisma',
  'S10',
];

// Expense categories for filters
export const expenseCategories = [
  'Despachante',
  'Cartório',
  'Lavagem',
  'Funilaria',
  'IPVA',
  'Revisão',
  'Mecânica',
  'Elétrica',
  'Pneu',
  'Polimento',
  'Laudo',
  'Combustível',
];

// Aliases for backward compatibility with demo pages
export const demoVehicles = vehicles

export const expensesByCategory = getExpenseAnalysis()

export interface DemoSale {
  id: string
  vehicle: string
  customerName: string
  salesperson: string
  salePrice: number
  profit: number
  profitPercent: number
  date: string
}

export const demoSales: DemoSale[] = [
  { id: '1', vehicle: 'Toyota Corolla 2022', customerName: 'Carlos Mendes', salesperson: 'João Silva', salePrice: 115000, profit: 13700, profitPercent: 13.5, date: '2024-03-28' },
  { id: '2', vehicle: 'Honda Civic 2021', customerName: 'Ana Paula Souza', salesperson: 'Maria Costa', salePrice: 98000, profit: 11200, profitPercent: 12.9, date: '2024-03-25' },
  { id: '3', vehicle: 'VW Gol 2020', customerName: 'Roberto Lima', salesperson: 'João Silva', salePrice: 52000, profit: 5800, profitPercent: 12.6, date: '2024-03-22' },
  { id: '4', vehicle: 'Chevrolet Onix 2023', customerName: 'Fernanda Castro', salesperson: 'Pedro Alves', salePrice: 87000, profit: 9500, profitPercent: 12.2, date: '2024-03-18' },
]
