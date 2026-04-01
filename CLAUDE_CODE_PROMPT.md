# MONEYCAR AI - Complete Build Prompt for Claude Code

## PROJECT OVERVIEW

Build **Moneycar AI** - an AI-powered intelligence platform for Brazilian used car dealerships that connects to the existing Moneycar dealership management software. The platform analyzes dealership data and provides actionable insights via a web dashboard and WhatsApp alerts.

**Target User:** Brazilian used car dealership owners (donos de revenda) who use Moneycar software
**Primary Value:** Turn data into decisions - inventory alerts, expense analysis, profit optimization
**Tech Stack:** Next.js 14, Supabase, Claude API, Evolution API (WhatsApp)

---

## DIRECTORY STRUCTURE

Create the project at: `/Users/robertcosta/claude/projects/moneycar`

```
moneycar/
├── apps/
│   ├── web/                          # Next.js 14 frontend
│   │   ├── app/
│   │   │   ├── (marketing)/          # Public pages
│   │   │   │   ├── page.tsx          # Landing page
│   │   │   │   ├── pricing/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── (auth)/               # Auth pages
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── (dashboard)/          # Protected dashboard
│   │   │   │   ├── layout.tsx        # Dashboard layout with sidebar
│   │   │   │   ├── page.tsx          # Main dashboard
│   │   │   │   ├── chat/page.tsx     # AI assistant
│   │   │   │   ├── veiculos/
│   │   │   │   │   ├── page.tsx      # Vehicle list
│   │   │   │   │   └── [id]/page.tsx # Vehicle detail
│   │   │   │   ├── alertas/page.tsx  # AI alerts
│   │   │   │   ├── despesas/page.tsx # Expenses
│   │   │   │   ├── relatorios/page.tsx
│   │   │   │   ├── importar/page.tsx # Data import
│   │   │   │   └── config/page.tsx   # Settings
│   │   │   ├── api/
│   │   │   │   ├── chat/route.ts     # AI chat endpoint
│   │   │   │   ├── vehicles/route.ts
│   │   │   │   ├── expenses/route.ts
│   │   │   │   ├── alerts/route.ts
│   │   │   │   ├── upload/route.ts   # File upload/import
│   │   │   │   ├── webhook/
│   │   │   │   │   └── whatsapp/route.ts
│   │   │   │   └── cron/
│   │   │   │       └── daily-alerts/route.ts
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── dashboard/            # Dashboard-specific
│   │   │   ├── chat/                 # AI chat components
│   │   │   ├── vehicles/             # Vehicle components
│   │   │   └── layout/               # Sidebar, Header
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts
│   │   │   │   ├── server.ts
│   │   │   │   └── middleware.ts
│   │   │   ├── ai/
│   │   │   │   ├── claude.ts         # Claude API client
│   │   │   │   ├── prompts.ts        # System prompts
│   │   │   │   └── tools.ts          # AI function tools
│   │   │   ├── whatsapp/
│   │   │   │   └── evolution.ts      # Evolution API client
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   │   ├── use-vehicles.ts
│   │   │   ├── use-expenses.ts
│   │   │   └── use-chat.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   └── tsconfig.json
│   │
│   └── api/                          # Optional: Separate Fastify API
│       └── (if needed for heavy processing)
│
├── packages/
│   ├── database/
│   │   ├── schema.sql                # Supabase schema
│   │   ├── seed.ts                   # Demo data seeding
│   │   └── migrations/
│   └── shared/
│       ├── types.ts                  # Shared TypeScript types
│       └── constants.ts
│
├── scripts/
│   ├── import-moneycar.ts            # MDB/Access import script
│   └── generate-alerts.ts            # Daily alert generation
│
├── docs/
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── MONEYCAR-INTEGRATION.md
│
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## PHASE 1: PROJECT SETUP

### 1.1 Initialize Monorepo

```bash
cd /Users/robertcosta/claude/projects
mkdir moneycar && cd moneycar

# Initialize pnpm workspace
pnpm init

# Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

# Create turbo config
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {}
  }
}
EOF

# Install turbo
pnpm add -D turbo typescript -w
```

### 1.2 Create Next.js Web App

```bash
mkdir -p apps/web && cd apps/web

# Initialize Next.js 14 with TypeScript, Tailwind, App Router
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-pnpm

# Install dependencies
pnpm add @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk
pnpm add @radix-ui/react-avatar @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add @radix-ui/react-label @radix-ui/react-progress @radix-ui/react-scroll-area
pnpm add @radix-ui/react-select @radix-ui/react-slot @radix-ui/react-tabs
pnpm add @radix-ui/react-tooltip
pnpm add @tanstack/react-query
pnpm add class-variance-authority clsx tailwind-merge
pnpm add date-fns framer-motion lucide-react
pnpm add next-themes recharts sonner zod
pnpm add react-dropzone

pnpm add -D tailwindcss-animate
```

### 1.3 Environment Variables

Create `.env.example` at project root:

```env
# ===========================================
# MONEYCAR AI - Environment Variables
# ===========================================

# Supabase (https://supabase.com)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic Claude API (https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-your-key

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Moneycar AI

# WhatsApp - Evolution API (self-hosted or cloud)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-key
EVOLUTION_INSTANCE=moneycar

# Alternative: Z-API (Brazilian WhatsApp provider)
# ZAPI_INSTANCE_ID=your-instance
# ZAPI_TOKEN=your-token
# ZAPI_CLIENT_TOKEN=your-client-token

# Cron Jobs (Vercel Cron or external)
CRON_SECRET=your-cron-secret

# Optional: Analytics
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

---

## PHASE 2: DATABASE SCHEMA (SUPABASE)

### 2.1 Create Supabase Project

1. Go to https://supabase.com and create a new project
2. Name: `moneycar-ai`
3. Region: São Paulo (sa-east-1) - closest to Brazil
4. Get your project URL and keys from Settings > API

### 2.2 Database Schema

Create this schema in Supabase SQL Editor:

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- DEALERSHIPS (Multi-tenant support)
-- ================================================
CREATE TABLE dealerships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  cnpj VARCHAR(18),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  logo_url TEXT,
  plan VARCHAR(20) DEFAULT 'free', -- free, pro, enterprise
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- USERS (Linked to Supabase Auth)
-- ================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'staff', -- owner, manager, salesperson, staff
  avatar_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- VEHICLES
-- ================================================
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  
  -- Identification
  plate VARCHAR(10),
  chassis VARCHAR(17),
  renavam VARCHAR(11),
  
  -- Vehicle details
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  version VARCHAR(100),
  year_fab INTEGER NOT NULL,
  year_model INTEGER NOT NULL,
  color VARCHAR(50),
  mileage INTEGER DEFAULT 0,
  fuel VARCHAR(20), -- FLEX, GASOLINA, DIESEL, ELÉTRICO, HÍBRIDO
  transmission VARCHAR(20), -- MANUAL, AUTOMÁTICO, CVT
  
  -- Financial
  purchase_price DECIMAL(12,2) NOT NULL,
  sale_price DECIMAL(12,2),
  fipe_price DECIMAL(12,2),
  min_price DECIMAL(12,2),
  
  -- Status & Dates
  status VARCHAR(20) DEFAULT 'available', -- available, reserved, sold, consigned
  purchase_date DATE NOT NULL,
  sale_date DATE,
  
  -- Relations
  supplier_name VARCHAR(255),
  customer_id UUID,
  
  -- Media
  photos TEXT[] DEFAULT '{}',
  
  -- Metadata
  notes TEXT,
  source VARCHAR(50), -- COMPRA, TROCA, CONSIGNAÇÃO
  external_id VARCHAR(100), -- ID from Moneycar import
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Computed column for days in stock
ALTER TABLE vehicles ADD COLUMN days_in_stock INTEGER 
  GENERATED ALWAYS AS (
    CASE 
      WHEN sale_date IS NOT NULL THEN sale_date - purchase_date
      ELSE CURRENT_DATE - purchase_date
    END
  ) STORED;

CREATE INDEX idx_vehicles_dealership ON vehicles(dealership_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_days ON vehicles(days_in_stock);

-- ================================================
-- EXPENSES
-- ================================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  
  category VARCHAR(50) NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL,
  
  vendor_name VARCHAR(255),
  payment_method VARCHAR(50),
  receipt_url TEXT,
  
  created_by UUID REFERENCES users(id),
  external_id VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_vehicle ON expenses(vehicle_id);
CREATE INDEX idx_expenses_category ON expenses(category);

-- ================================================
-- SALES
-- ================================================
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  
  -- Customer info
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  customer_email VARCHAR(255),
  customer_cpf VARCHAR(14),
  
  -- Financial
  sale_price DECIMAL(12,2) NOT NULL,
  purchase_price DECIMAL(12,2) NOT NULL,
  total_expenses DECIMAL(12,2) DEFAULT 0,
  profit DECIMAL(12,2),
  profit_percent DECIMAL(5,2),
  
  -- Payment
  payment_method VARCHAR(50) NOT NULL,
  down_payment DECIMAL(12,2),
  financing_bank VARCHAR(100),
  
  -- Details
  sale_date DATE NOT NULL,
  salesperson_id UUID REFERENCES users(id),
  salesperson_name VARCHAR(255),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- AI ALERTS
-- ================================================
CREATE TABLE ai_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  
  type VARCHAR(20) NOT NULL, -- critical, warning, info, success
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  action VARCHAR(100),
  action_data JSONB,
  
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  sent_whatsapp BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_unread ON ai_alerts(dealership_id, is_read, is_dismissed);

-- ================================================
-- AI CONVERSATIONS
-- ================================================
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  
  messages JSONB DEFAULT '[]',
  context JSONB DEFAULT '{}', -- Store relevant data context
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- DATA IMPORTS (Track import history)
-- ================================================
CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  
  filename VARCHAR(255),
  file_type VARCHAR(20), -- mdb, csv, xlsx
  file_size INTEGER,
  
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, complete, error
  records_imported INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ================================================
-- ROW LEVEL SECURITY
-- ================================================
ALTER TABLE dealerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their dealership's data
CREATE POLICY "Users access own dealership data" ON vehicles
  FOR ALL USING (
    dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users access own dealership expenses" ON expenses
  FOR ALL USING (
    dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users access own dealership sales" ON sales
  FOR ALL USING (
    dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users access own dealership alerts" ON ai_alerts
  FOR ALL USING (
    dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid())
  );

-- ================================================
-- HELPER FUNCTIONS
-- ================================================

-- Get vehicle with calculated fields
CREATE OR REPLACE FUNCTION get_vehicle_with_stats(v_id UUID)
RETURNS TABLE (
  id UUID,
  brand VARCHAR,
  model VARCHAR,
  plate VARCHAR,
  purchase_price DECIMAL,
  sale_price DECIMAL,
  total_expenses DECIMAL,
  margin DECIMAL,
  margin_percent DECIMAL,
  days_in_stock INTEGER,
  status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.brand,
    v.model,
    v.plate,
    v.purchase_price,
    v.sale_price,
    COALESCE(SUM(e.amount), 0) as total_expenses,
    v.sale_price - v.purchase_price - COALESCE(SUM(e.amount), 0) as margin,
    CASE WHEN v.sale_price > 0 
      THEN ((v.sale_price - v.purchase_price - COALESCE(SUM(e.amount), 0)) / v.sale_price) * 100
      ELSE 0
    END as margin_percent,
    v.days_in_stock,
    v.status
  FROM vehicles v
  LEFT JOIN expenses e ON e.vehicle_id = v.id
  WHERE v.id = v_id
  GROUP BY v.id;
END;
$$ LANGUAGE plpgsql;

-- Dashboard stats function
CREATE OR REPLACE FUNCTION get_dashboard_stats(d_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_vehicles', (SELECT COUNT(*) FROM vehicles WHERE dealership_id = d_id),
    'available_vehicles', (SELECT COUNT(*) FROM vehicles WHERE dealership_id = d_id AND status = 'available'),
    'critical_vehicles', (SELECT COUNT(*) FROM vehicles WHERE dealership_id = d_id AND status = 'available' AND days_in_stock > 60),
    'avg_days_in_stock', (SELECT COALESCE(AVG(days_in_stock), 0) FROM vehicles WHERE dealership_id = d_id AND status = 'available'),
    'total_expenses', (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE dealership_id = d_id AND date >= date_trunc('month', CURRENT_DATE)),
    'monthly_sales', (SELECT COUNT(*) FROM sales WHERE dealership_id = d_id AND sale_date >= date_trunc('month', CURRENT_DATE)),
    'monthly_revenue', (SELECT COALESCE(SUM(sale_price), 0) FROM sales WHERE dealership_id = d_id AND sale_date >= date_trunc('month', CURRENT_DATE)),
    'monthly_profit', (SELECT COALESCE(SUM(profit), 0) FROM sales WHERE dealership_id = d_id AND sale_date >= date_trunc('month', CURRENT_DATE))
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

---

## PHASE 3: FRONTEND IMPLEMENTATION

### 3.1 Tailwind Configuration

```typescript
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
```

### 3.2 Global CSS with CSS Variables

```css
/* apps/web/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 250 91% 60%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 250 91% 60%;
    --radius: 0.75rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 250 91% 65%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 250 91% 65%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}

/* Custom utility classes */
.gradient-text {
  @apply bg-gradient-to-r from-violet-500 to-purple-600 bg-clip-text text-transparent;
}

.glass {
  @apply bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl;
}

.card-hover {
  @apply transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5;
}
```

### 3.3 Key Components to Build

#### Landing Page (`app/(marketing)/page.tsx`)
- Hero section with gradient background
- Features grid (6 cards)
- Pricing section (3 tiers: Grátis, Pro R$297, Enterprise)
- CTA section
- Footer

#### Dashboard Layout (`app/(dashboard)/layout.tsx`)
- Sidebar with navigation (Dashboard, Chat AI, Veículos, Alertas, Despesas, Relatórios, Importar)
- Header with search, notifications, user menu
- Responsive mobile menu

#### Main Dashboard (`app/(dashboard)/page.tsx`)
- Stats cards (vehicles, sales, revenue, avg days)
- AI Quick Questions (clickable prompts)
- Alerts panel (critical/warning)
- Vehicle inventory by age (colored by days)
- Expense breakdown chart
- Recent sales list

#### AI Chat (`app/(dashboard)/chat/page.tsx`)
- Full-page chat interface
- Quick action buttons
- Message history with typing indicator
- Markdown rendering for AI responses

#### Vehicles Page (`app/(dashboard)/veiculos/page.tsx`)
- Search and filter bar
- Stats cards (available, reserved, critical)
- Vehicle cards with:
  - Photo placeholder
  - Brand/Model/Year
  - Plate, mileage
  - Purchase price, sale price
  - Total expenses, margin
  - Days in stock (color-coded badge)
  - AI suggestion for critical vehicles

#### Alerts Page (`app/(dashboard)/alertas/page.tsx`)
- Summary cards by type
- WhatsApp preview/activation
- Tabbed list (All, Critical, Warning, Success)
- Dismissable alert cards

#### Expenses Page (`app/(dashboard)/despesas/page.tsx`)
- Category breakdown with progress bars
- Expense list with vehicle association
- Vendor summary
- AI insight card (despachante above market)

#### Import Page (`app/(dashboard)/importar/page.tsx`)
- Dropzone for file upload
- Progress indicator
- Processing status
- Import results with counts

---

## PHASE 4: AI INTEGRATION (CLAUDE API)

### 4.1 Claude Client Setup

```typescript
// apps/web/lib/ai/claude.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function chatWithClaude(
  messages: ChatMessage[],
  context: DealershipContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context)
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  })

  return response.content[0].type === 'text' 
    ? response.content[0].text 
    : ''
}

interface DealershipContext {
  dealershipName: string
  stats: DashboardStats
  vehicles: VehicleSummary[]
  expenses: ExpenseSummary[]
  recentSales: SaleSummary[]
}

function buildSystemPrompt(context: DealershipContext): string {
  return `Você é o assistente de IA da Moneycar, especializado em ajudar revendas de veículos.
  
Você está ajudando a revenda "${context.dealershipName}".

DADOS ATUAIS:
- Veículos em estoque: ${context.stats.availableVehicles}
- Veículos críticos (+60 dias): ${context.stats.criticalVehicles}
- Tempo médio em estoque: ${context.stats.avgDaysInStock} dias
- Margem média: ${context.stats.avgMargin}%
- Vendas do mês: ${context.stats.monthlySales}
- Faturamento do mês: R$ ${context.stats.monthlyRevenue.toLocaleString('pt-BR')}
- Lucro do mês: R$ ${context.stats.monthlyProfit.toLocaleString('pt-BR')}

VEÍCULOS EM ESTOQUE:
${context.vehicles.map(v => 
  `- ${v.brand} ${v.model} (${v.plate}): ${v.daysInStock} dias, R$ ${v.salePrice}, margem ${v.marginPercent}%`
).join('\n')}

DESPESAS RECENTES:
${context.expenses.map(e => 
  `- ${e.category}: R$ ${e.total} (${e.count} transações)`
).join('\n')}

INSTRUÇÕES:
1. Responda sempre em português brasileiro
2. Seja direto e prático - donos de revenda são ocupados
3. Use dados concretos nas suas respostas
4. Sugira ações específicas quando apropriado
5. Use emojis com moderação para destacar pontos importantes
6. Formate números em reais (R$) com separador de milhares
7. Quando sugerir redução de preço, calcule o novo valor
8. Para veículos críticos (>60 dias), sempre sugira ação

FORMATO DE RESPOSTA:
- Use **negrito** para destacar números e nomes de veículos
- Use listas quando apropriado
- Mantenha respostas concisas (máximo 300 palavras)
- Termine com uma sugestão de ação quando relevante`
}
```

### 4.2 AI Chat API Route

```typescript
// apps/web/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chatWithClaude } from '@/lib/ai/claude'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages, conversationId } = await req.json()

    // Get user's dealership
    const { data: userData } = await supabase
      .from('users')
      .select('dealership_id')
      .eq('id', user.id)
      .single()

    if (!userData?.dealership_id) {
      return NextResponse.json({ error: 'No dealership found' }, { status: 400 })
    }

    // Get context data
    const context = await getDealershipContext(supabase, userData.dealership_id)

    // Call Claude
    const response = await chatWithClaude(messages, context)

    // Save conversation
    if (conversationId) {
      await supabase
        .from('ai_conversations')
        .update({ 
          messages: [...messages, { role: 'assistant', content: response }],
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
    }

    return NextResponse.json({ message: response })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat' },
      { status: 500 }
    )
  }
}

async function getDealershipContext(supabase: any, dealershipId: string) {
  // Fetch all needed data in parallel
  const [
    { data: dealership },
    { data: vehicles },
    { data: expenses },
    { data: sales },
  ] = await Promise.all([
    supabase.from('dealerships').select('name').eq('id', dealershipId).single(),
    supabase.from('vehicles')
      .select('*')
      .eq('dealership_id', dealershipId)
      .eq('status', 'available')
      .order('days_in_stock', { ascending: false }),
    supabase.from('expenses')
      .select('category, amount')
      .eq('dealership_id', dealershipId)
      .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('sales')
      .select('*')
      .eq('dealership_id', dealershipId)
      .gte('sale_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  // Calculate stats
  const stats = calculateStats(vehicles, sales, expenses)
  const expenseSummary = summarizeExpenses(expenses)

  return {
    dealershipName: dealership?.name || 'Sua Revenda',
    stats,
    vehicles: vehicles?.slice(0, 20) || [],
    expenses: expenseSummary,
    recentSales: sales || [],
  }
}
```

### 4.3 AI Alert Generation

```typescript
// apps/web/lib/ai/alerts.ts

export async function generateDailyAlerts(dealershipId: string) {
  const supabase = createClient()
  
  // Get vehicles
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('*')
    .eq('dealership_id', dealershipId)
    .eq('status', 'available')

  const alerts: AIAlert[] = []

  // Critical: Vehicles over 60 days
  vehicles?.filter(v => v.days_in_stock > 60).forEach(v => {
    const suggestedDiscount = Math.round(v.sale_price * 0.05)
    const newPrice = v.sale_price - suggestedDiscount
    
    alerts.push({
      dealership_id: dealershipId,
      vehicle_id: v.id,
      type: 'critical',
      title: `${v.brand} ${v.model} está há ${v.days_in_stock} dias`,
      message: `Considere baixar para R$ ${newPrice.toLocaleString('pt-BR')} (-5%) para vender esta semana`,
      action: 'Ajustar Preço',
      action_data: { suggested_price: newPrice },
    })
  })

  // Warning: Vehicles 45-60 days
  vehicles?.filter(v => v.days_in_stock >= 45 && v.days_in_stock <= 60).forEach(v => {
    alerts.push({
      dealership_id: dealershipId,
      vehicle_id: v.id,
      type: 'warning',
      title: `${v.brand} ${v.model} está há ${v.days_in_stock} dias`,
      message: 'Invista em polimento ou melhore as fotos do anúncio',
      action: 'Ver Detalhes',
    })
  })

  // High margin opportunities
  vehicles?.filter(v => v.margin_percent > 17).forEach(v => {
    alerts.push({
      dealership_id: dealershipId,
      vehicle_id: v.id,
      type: 'success',
      title: `${v.brand} ${v.model} tem boa margem`,
      message: `Margem de ${v.margin_percent.toFixed(1)}% - priorize a venda`,
    })
  })

  // Insert alerts
  if (alerts.length > 0) {
    await supabase.from('ai_alerts').insert(alerts)
  }

  return alerts
}
```

---

## PHASE 5: WHATSAPP INTEGRATION

### 5.1 Evolution API Setup

Evolution API is a free, self-hosted WhatsApp API. Options:

**Option A: Self-hosted (Docker)**
```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=your-secret-key \
  atendai/evolution-api
```

**Option B: Use Z-API (paid Brazilian provider)**
- Sign up at https://z-api.io
- Get instance ID and tokens
- ~R$100-200/month

### 5.2 WhatsApp Client

```typescript
// apps/web/lib/whatsapp/evolution.ts

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE

export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY!,
        },
        body: JSON.stringify({
          number: formatPhoneNumber(phone),
          text: message,
        }),
      }
    )

    return response.ok
  } catch (error) {
    console.error('WhatsApp send error:', error)
    return false
  }
}

export async function sendDailyAlertMessage(
  phone: string,
  dealershipName: string,
  alerts: AIAlert[]
): Promise<boolean> {
  const critical = alerts.filter(a => a.type === 'critical')
  const warning = alerts.filter(a => a.type === 'warning')
  
  const message = `🌅 Bom dia, ${dealershipName}!

📊 *Resumo de hoje:*
${critical.length > 0 ? `🔴 ${critical.length} veículo(s) crítico(s)` : ''}
${warning.length > 0 ? `🟡 ${warning.length} precisa(m) de atenção` : ''}

${critical.length > 0 ? `
*Prioridade:*
${critical.slice(0, 3).map(a => `• ${a.title}`).join('\n')}
` : '✅ Nenhum veículo crítico hoje!'}

Responda qualquer número para detalhes ou acesse o dashboard.

_Moneycar AI_`

  return sendWhatsAppMessage(phone, message)
}

function formatPhoneNumber(phone: string): string {
  // Remove non-digits
  const digits = phone.replace(/\D/g, '')
  
  // Add Brazil country code if needed
  if (digits.length === 11) {
    return `55${digits}`
  }
  if (digits.length === 13 && digits.startsWith('55')) {
    return digits
  }
  
  return digits
}
```

### 5.3 Daily Cron Job

```typescript
// apps/web/app/api/cron/daily-alerts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDailyAlerts } from '@/lib/ai/alerts'
import { sendDailyAlertMessage } from '@/lib/whatsapp/evolution'

// Vercel Cron: runs at 8am São Paulo time
export const runtime = 'edge'
export const preferredRegion = 'gru1' // São Paulo

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get all active dealerships with WhatsApp enabled
  const { data: dealerships } = await supabase
    .from('dealerships')
    .select('id, name, whatsapp, settings')
    .eq('settings->whatsapp_alerts', true)

  const results = []

  for (const dealership of dealerships || []) {
    // Generate alerts
    const alerts = await generateDailyAlerts(dealership.id)

    // Send WhatsApp if phone configured
    if (dealership.whatsapp) {
      const sent = await sendDailyAlertMessage(
        dealership.whatsapp,
        dealership.name,
        alerts
      )
      
      // Mark alerts as sent
      if (sent) {
        await supabase
          .from('ai_alerts')
          .update({ sent_whatsapp: true })
          .in('id', alerts.map(a => a.id))
      }

      results.push({
        dealership: dealership.name,
        alerts: alerts.length,
        whatsapp_sent: sent,
      })
    }
  }

  return NextResponse.json({ success: true, results })
}
```

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/daily-alerts",
      "schedule": "0 11 * * *"
    }
  ]
}
```

---

## PHASE 6: DATA IMPORT (MONEYCAR MDB)

### 6.1 MDB Import Script

For importing Microsoft Access (.mdb) files, use a Node.js script:

```typescript
// scripts/import-moneycar.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

// Requires: apt-get install mdbtools
// Or on Mac: brew install mdbtools

async function importMoneycarDatabase(
  mdbPath: string,
  dealershipId: string
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // List tables in MDB
  const { stdout: tables } = await execAsync(`mdb-tables -1 "${mdbPath}"`)
  const tableList = tables.trim().split('\n')

  console.log('Found tables:', tableList)

  // Export relevant tables to CSV
  const tempDir = `/tmp/moneycar-import-${Date.now()}`
  fs.mkdirSync(tempDir)

  // Common Moneycar tables
  const relevantTables = [
    'VEICULOS',
    'DESPESAS',
    'VENDAS',
    'CLIENTES',
    'FORNECEDORES',
  ]

  for (const table of relevantTables) {
    if (tableList.includes(table)) {
      const csvPath = path.join(tempDir, `${table}.csv`)
      await execAsync(`mdb-export "${mdbPath}" "${table}" > "${csvPath}"`)
      
      // Parse and import
      const data = await parseCSV(csvPath)
      await importTable(supabase, table, data, dealershipId)
    }
  }

  // Cleanup
  fs.rmSync(tempDir, { recursive: true })

  return { success: true }
}

async function importTable(
  supabase: any,
  tableName: string,
  data: any[],
  dealershipId: string
) {
  switch (tableName) {
    case 'VEICULOS':
      return importVehicles(supabase, data, dealershipId)
    case 'DESPESAS':
      return importExpenses(supabase, data, dealershipId)
    // ... other tables
  }
}

async function importVehicles(
  supabase: any,
  data: any[],
  dealershipId: string
) {
  const vehicles = data.map(row => ({
    dealership_id: dealershipId,
    external_id: row.ID || row.CODIGO,
    plate: row.PLACA,
    chassis: row.CHASSI,
    brand: row.MARCA,
    model: row.MODELO,
    version: row.VERSAO,
    year_fab: parseInt(row.ANO_FAB) || parseInt(row.ANO),
    year_model: parseInt(row.ANO_MOD) || parseInt(row.ANO),
    color: row.COR,
    mileage: parseInt(row.KM) || 0,
    fuel: row.COMBUSTIVEL,
    purchase_price: parseFloat(row.VALOR_COMPRA) || 0,
    sale_price: parseFloat(row.VALOR_VENDA) || 0,
    purchase_date: parseDate(row.DATA_COMPRA),
    status: mapStatus(row.STATUS),
  }))

  const { error } = await supabase
    .from('vehicles')
    .upsert(vehicles, { onConflict: 'external_id' })

  if (error) console.error('Vehicle import error:', error)
  
  return vehicles.length
}
```

### 6.2 Web Upload Handler

```typescript
// apps/web/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File
  
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Get user's dealership
  const { data: userData } = await supabase
    .from('users')
    .select('dealership_id')
    .eq('id', user.id)
    .single()

  // Upload to Supabase Storage
  const fileName = `imports/${userData.dealership_id}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(fileName, file)

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  // Create import record
  const { data: importRecord } = await supabase
    .from('imports')
    .insert({
      dealership_id: userData.dealership_id,
      filename: file.name,
      file_type: file.name.split('.').pop(),
      file_size: file.size,
      status: 'pending',
      created_by: user.id,
    })
    .select()
    .single()

  // Trigger processing (could be a background job)
  // For MVP, process synchronously
  // In production, use a queue (Vercel Queue, Supabase Edge Function, etc.)

  return NextResponse.json({ 
    importId: importRecord.id,
    status: 'processing'
  })
}
```

---

## PHASE 7: DEPLOYMENT

### 7.1 Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from project root
cd /Users/robertcosta/claude/projects/moneycar
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add EVOLUTION_API_URL
vercel env add EVOLUTION_API_KEY
vercel env add CRON_SECRET

# Deploy to production
vercel --prod
```

### 7.2 Supabase Configuration

1. **Enable Email Auth**
   - Go to Authentication > Providers
   - Enable Email provider
   - Configure SMTP for production

2. **Create Storage Bucket**
   ```sql
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('uploads', 'uploads', false);
   ```

3. **Set up Edge Functions (optional)**
   - For heavy processing, create Supabase Edge Functions
   - Deploy with: `supabase functions deploy`

### 7.3 Domain Setup

1. Add custom domain in Vercel: `app.moneycar.ai`
2. Configure DNS:
   - CNAME: `app` → `cname.vercel-dns.com`
3. SSL is automatic

---

## PHASE 8: TESTING CHECKLIST

### Functional Tests
- [ ] User can register and login
- [ ] Dashboard loads with correct stats
- [ ] AI chat responds to questions
- [ ] Vehicles CRUD operations work
- [ ] Expenses are tracked per vehicle
- [ ] Alerts are generated correctly
- [ ] File import processes MDB files
- [ ] WhatsApp messages are sent

### Performance Tests
- [ ] Dashboard loads in <2s
- [ ] AI responses in <3s
- [ ] Search is instant (<200ms)

### Security Tests
- [ ] RLS policies prevent cross-tenant access
- [ ] API routes are protected
- [ ] File uploads are validated
- [ ] Rate limiting is in place

---

## QUICK START COMMANDS

```bash
# Clone and setup
cd /Users/robertcosta/claude/projects/moneycar
pnpm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your keys

# Run database migrations
cd packages/database
pnpm db:push

# Seed demo data (optional)
pnpm db:seed

# Start development
cd ../..
pnpm dev

# Open browser
open http://localhost:3000
```

---

## DEMO DATA

For testing without real data, seed the database with sample data from Stopcar Veículos:
- 10 vehicles (GOL, HB20, ONIX, ARGO, FIT, SANDERO, VERSA, PALIO, PRISMA, S10)
- Expenses by category (DESPACHANTE, LAVAGEM, FUNILARIA, etc.)
- Sample sales
- AI alerts

This allows potential customers to test the platform immediately.

---

## NOTES FOR CLAUDE CODE

1. **Start with the database schema** - it's the foundation
2. **Build UI components iteratively** - start with shadcn/ui base
3. **Test AI integration early** - it's the core value prop
4. **Keep the landing page simple** - focus on the dashboard
5. **Use demo data liberally** - customers need to see value immediately

**Priority order:**
1. Database + Auth
2. Dashboard layout
3. Vehicle management
4. AI Chat
5. Alerts
6. Expenses
7. Import functionality
8. WhatsApp integration
9. Landing page polish
10. Deployment

Good luck! 🚀
