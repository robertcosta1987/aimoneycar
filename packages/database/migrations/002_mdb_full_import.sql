-- ================================================
-- MONEYCAR AI - MDB FULL IMPORT MIGRATION
-- Migration 002: 1:1 mapping for all 44 MDB tables
-- ================================================
-- MDB Table → Supabase Table mapping:
--   tbVeiculo              → vehicles (exists in 001, external_id already there)
--   tbMovimento            → expenses (exists in 001, external_id already there)
--   tbCliente              → customers (NEW — not in 001)
--   tbFornecedor           → vendors (NEW — not in 001)
--   tbDadosVenda           → sales (already exists) + sale_data (raw)
--   tbFabricantes          → manufacturers (NEW)
--   tbCombustivel          → fuel_types (NEW)
--   tbPlanoContas          → plan_accounts (NEW)
--   tbBancosCadastro       → banks (NEW)
--   tbContasCorrentes      → bank_accounts (NEW)
--   tbFuncionario          → employees (NEW)
--   tbfuncionarioSalario   → employee_salaries (NEW)
--   tbComissao             → commissions (NEW)
--   tbComissaoPadrao       → commission_standards (NEW)
--   tbOrigemCliente        → customer_origins (NEW)
--   tbClienteComplemento   → customer_complements (NEW)
--   tbClienteDadosComerciais → customer_commercial_data (NEW)
--   tbClienteReferenciasBens → customer_asset_references (NEW)
--   tbDadosCompra          → purchase_data (NEW)
--   tbDadosVenda           → sale_data (NEW raw copy)
--   tbFinanciamento        → financings (NEW)
--   tbSeguro               → insurances (NEW)
--   tbVeiculoDocumento     → vehicle_documents (NEW)
--   tbVeiculoDocumentoCompra → vehicle_purchase_documents (NEW)
--   tbVeiculoMulta         → vehicle_fines (NEW)
--   tbOpcionais            → optionals (NEW)
--   tbVeiculoOpcionais     → vehicle_optionals (NEW)
--   tbVeiculoPendencia     → vehicle_pendencies (NEW)
--   tbVeiculoProtocoloEntrega → vehicle_delivery_protocols (NEW)
--   tbveiculoTroca         → vehicle_trades (NEW)
--   tbRateioVeiculo        → vehicle_apportionment (NEW)
--   tbDespesaPadrao        → standard_expenses (NEW)
--   tbDespesaPosVenda      → post_sale_expenses (NEW)
--   tbPendenciaPadrao      → standard_pendencies (NEW)
--   tbMotivoCancelamento   → cancellation_reasons (NEW)
--   tbPedidosClientes      → orders (NEW)
--   tbPedidosFollowUp      → order_followups (NEW)
--   tbEnumGeral            → general_enumerations (NEW)
--   tbCadastroTextos       → text_configurations (NEW)
--   tbNCM                  → ncm (NEW)
--   tbNaturezaOp           → nature_of_operation (NEW)
--   tbNFe ide              → nfe_ide (NEW)
--   tbNFe emit             → nfe_emit (NEW)
--   tbNFe dest             → nfe_dest (NEW)
--   tbNFe prod             → nfe_prod (NEW)
--   tbVisaoGeralMovimentacao → VIEW visao_geral_movimentacao (NEW)

-- ================================================
-- PATCH EXISTING TABLES
-- ================================================
-- Note: 001_initial.sql already created:
--   vehicles (with external_id + unique constraint), expenses (with external_id),
--   sales, imports, ai_alerts, ai_conversations
-- It does NOT have: customers, vendors

-- expenses: add unique index for upsert (external_id column already exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_external
  ON expenses(dealership_id, external_id)
  WHERE external_id IS NOT NULL;

-- sales: add external_id for linking to tbDadosVenda
ALTER TABLE sales ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_external
  ON sales(dealership_id, external_id)
  WHERE external_id IS NOT NULL;

-- ================================================
-- CUSTOMERS (not in 001_initial.sql)
-- ================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  cpf TEXT,
  cnpj TEXT,
  rg TEXT,
  birth_date DATE,
  address TEXT,
  neighborhood TEXT,
  complement TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  source TEXT,
  origin_external_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_customers_dealership ON customers(dealership_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_dealership_policy" ON customers FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

-- ================================================
-- VENDORS (not in 001_initial.sql)
-- ================================================
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  phone TEXT,
  email TEXT,
  cnpj TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_vendors_dealership ON vendors(dealership_id);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_dealership_policy" ON vendors FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

-- ================================================
-- LOOKUP / REFERENCE TABLES
-- ================================================

-- tbFabricantes → manufacturers
CREATE TABLE IF NOT EXISTS manufacturers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- fabID
  name TEXT NOT NULL,         -- fabNome
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_manufacturers_dealership ON manufacturers(dealership_id);

-- tbCombustivel → fuel_types
CREATE TABLE IF NOT EXISTS fuel_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- gazID
  name TEXT NOT NULL,         -- gazDescri
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbPlanoContas → plan_accounts (chart of accounts)
CREATE TABLE IF NOT EXISTS plan_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- plaID
  name TEXT NOT NULL,         -- PlaNome
  category TEXT,
  type TEXT,                  -- RECEITA, DESPESA, etc.
  parent_id UUID REFERENCES plan_accounts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_accounts_dealership ON plan_accounts(dealership_id);

-- tbOrigemCliente → customer_origins
CREATE TABLE IF NOT EXISTS customer_origins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- oriID
  name TEXT NOT NULL,         -- oriDescri
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbMotivoCancelamento → cancellation_reasons
CREATE TABLE IF NOT EXISTS cancellation_reasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- mcanID
  description TEXT NOT NULL,  -- mcanDescri
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbPendenciaPadrao → standard_pendencies
CREATE TABLE IF NOT EXISTS standard_pendencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- ppnID
  description TEXT NOT NULL,  -- ppnDescri
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbDespesaPadrao → standard_expenses
CREATE TABLE IF NOT EXISTS standard_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- dpaID
  description TEXT NOT NULL,  -- dpaDescri
  plan_account_external_id TEXT,  -- plaID
  plan_account_id UUID REFERENCES plan_accounts(id),
  amount DECIMAL(12,2),       -- dpaValor
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbOpcionais → optionals (accessories catalog)
CREATE TABLE IF NOT EXISTS optionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- opcID
  name TEXT NOT NULL,         -- opcDescri
  category TEXT,              -- opcCategoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbEnumGeral → general_enumerations
CREATE TABLE IF NOT EXISTS general_enumerations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- enuID
  type TEXT NOT NULL,         -- enuTipo
  code TEXT,                  -- enuCodigo
  description TEXT NOT NULL,  -- enuDescri
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_general_enumerations_type ON general_enumerations(dealership_id, type);

-- tbCadastroTextos → text_configurations
CREATE TABLE IF NOT EXISTS text_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- texID
  key TEXT NOT NULL,          -- texDescri
  content TEXT,               -- texConteudo
  type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbNCM → ncm
CREATE TABLE IF NOT EXISTS ncm (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- ncmID
  code TEXT NOT NULL,         -- ncmCodigo
  description TEXT,           -- ncmDescri
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbNaturezaOp → nature_of_operation
CREATE TABLE IF NOT EXISTS nature_of_operation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- natID
  description TEXT NOT NULL,  -- natDescri
  cfop TEXT,                  -- natCFOP
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- ================================================
-- BANKING / FINANCIAL STRUCTURE
-- ================================================

-- tbBancosCadastro → banks
CREATE TABLE IF NOT EXISTS banks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- bancID
  name TEXT NOT NULL,         -- bancNome
  code TEXT,                  -- BACEN bank code
  agency TEXT,                -- bancAgencia
  account TEXT,               -- bancConta
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbContasCorrentes → bank_accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- ctaID
  name TEXT NOT NULL,         -- ctaNome
  bank_external_id TEXT,
  bank_id UUID REFERENCES banks(id),
  agency TEXT,                -- ctaAgencia
  account TEXT,               -- ctaConta
  balance DECIMAL(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_dealership ON bank_accounts(dealership_id);

-- ================================================
-- PERSONNEL
-- ================================================

-- tbFuncionario → employees
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- funID
  name TEXT NOT NULL,         -- funNome
  cpf TEXT,
  rg TEXT,
  role TEXT,                  -- funCargo
  email TEXT,
  phone TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  hire_date DATE,             -- funDataAdmissao
  termination_date DATE,      -- funDataDemissao
  base_salary DECIMAL(12,2),  -- funSalario
  commission_percent DECIMAL(5,2),
  is_active BOOLEAN DEFAULT TRUE,
  user_id UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_employees_dealership ON employees(dealership_id);

-- tbfuncionarioSalario → employee_salaries
CREATE TABLE IF NOT EXISTS employee_salaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- salID
  employee_external_id TEXT,
  employee_id UUID REFERENCES employees(id),
  date DATE,
  amount DECIMAL(12,2),
  type TEXT,                  -- SALARIO, ADIANTAMENTO, COMISSAO, BONUS, DESCONTO
  description TEXT,
  bank_account_external_id TEXT,
  bank_account_id UUID REFERENCES bank_accounts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_dealership ON employee_salaries(dealership_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee ON employee_salaries(employee_id);

-- tbComissaoPadrao → commission_standards
CREATE TABLE IF NOT EXISTS commission_standards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- cpaID
  employee_external_id TEXT,
  employee_id UUID REFERENCES employees(id),
  percent DECIMAL(5,2),
  min_value DECIMAL(12,2),
  max_value DECIMAL(12,2),
  type TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbComissao → commissions
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- comID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  employee_external_id TEXT,
  employee_id UUID REFERENCES employees(id),
  sale_id UUID REFERENCES sales(id),
  amount DECIMAL(12,2),       -- comValor
  percent DECIMAL(5,2),
  date DATE,                  -- comData
  paid_date DATE,
  is_paid BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_commissions_dealership ON commissions(dealership_id);
CREATE INDEX IF NOT EXISTS idx_commissions_employee ON commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_commissions_vehicle ON commissions(vehicle_id);

-- ================================================
-- CUSTOMER EXTENDED DATA
-- ================================================

-- tbClienteComplemento → customer_complements
CREATE TABLE IF NOT EXISTS customer_complements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  customer_external_id TEXT,  -- cliID
  customer_id UUID REFERENCES customers(id),
  father_name TEXT,
  mother_name TEXT,
  spouse_name TEXT,
  spouse_cpf TEXT,
  spouse_income DECIMAL(12,2),
  monthly_income DECIMAL(12,2),
  profession TEXT,
  employer TEXT,
  employer_phone TEXT,
  employer_address TEXT,
  employer_city TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_complements_customer ON customer_complements(customer_id);

-- tbClienteDadosComerciais → customer_commercial_data
CREATE TABLE IF NOT EXISTS customer_commercial_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  customer_external_id TEXT,
  customer_id UUID REFERENCES customers(id),
  company_name TEXT,
  cnpj TEXT,
  activity TEXT,
  monthly_revenue DECIMAL(12,2),
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_commercial_customer ON customer_commercial_data(customer_id);

-- tbClienteReferenciasBens → customer_asset_references
CREATE TABLE IF NOT EXISTS customer_asset_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,
  customer_external_id TEXT,
  customer_id UUID REFERENCES customers(id),
  type TEXT,                  -- IMOVEL, VEICULO, etc.
  description TEXT,
  value DECIMAL(12,2),
  financing_bank TEXT,
  monthly_payment DECIMAL(12,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_assets_customer ON customer_asset_references(customer_id);

-- ================================================
-- VEHICLE PURCHASE & SALE RAW DATA
-- ================================================

-- tbDadosCompra → purchase_data (raw purchase details, one row per vehicle)
CREATE TABLE IF NOT EXISTS purchase_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_external_id TEXT,   -- carID
  vehicle_id UUID REFERENCES vehicles(id),
  purchase_date DATE,         -- cData
  mileage INTEGER,            -- cKM
  purchase_price DECIMAL(12,2), -- cValor
  supplier_external_id TEXT,
  supplier_id UUID REFERENCES vendors(id),
  supplier_name TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, vehicle_external_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_data_vehicle ON purchase_data(vehicle_id);

-- tbDadosVenda → sale_data (raw sale details, one row per vehicle)
CREATE TABLE IF NOT EXISTS sale_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_external_id TEXT,   -- carID
  vehicle_id UUID REFERENCES vehicles(id),
  sale_date DATE,             -- vData
  mileage INTEGER,            -- vKM
  sale_price DECIMAL(12,2),   -- vValorVenda
  customer_external_id TEXT,  -- cliID
  customer_id UUID REFERENCES customers(id),
  payment_method TEXT,
  notes TEXT,
  sale_record_id UUID REFERENCES sales(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, vehicle_external_id)
);
CREATE INDEX IF NOT EXISTS idx_sale_data_vehicle ON sale_data(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sale_data_customer ON sale_data(customer_id);

-- ================================================
-- FINANCING & INSURANCE
-- ================================================

-- tbFinanciamento → financings
CREATE TABLE IF NOT EXISTS financings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- finID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  customer_external_id TEXT,
  customer_id UUID REFERENCES customers(id),
  bank TEXT,                  -- finBanco
  total_amount DECIMAL(12,2), -- finValor
  installments INTEGER,       -- finParcelas
  interest_rate DECIMAL(7,4), -- finTaxa (% monthly)
  installment_amount DECIMAL(12,2),
  down_payment DECIMAL(12,2),
  start_date DATE,            -- finData
  contract_number TEXT,
  status TEXT DEFAULT 'active', -- active, paid, cancelled
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_financings_dealership ON financings(dealership_id);
CREATE INDEX IF NOT EXISTS idx_financings_vehicle ON financings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_financings_customer ON financings(customer_id);

-- tbSeguro → insurances
CREATE TABLE IF NOT EXISTS insurances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- segID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  customer_external_id TEXT,
  customer_id UUID REFERENCES customers(id),
  insurer TEXT,               -- segEmpresa
  policy_number TEXT,         -- segApolice
  insured_value DECIMAL(12,2), -- segValor
  premium DECIMAL(12,2),      -- segPremio
  start_date DATE,            -- segDataInicio
  end_date DATE,              -- segDataFim
  coverage_type TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_insurances_dealership ON insurances(dealership_id);
CREATE INDEX IF NOT EXISTS idx_insurances_vehicle ON insurances(vehicle_id);

-- ================================================
-- VEHICLE DOCUMENTS & REGISTRY
-- ================================================

-- tbVeiculoDocumento → vehicle_documents
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- docID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  type TEXT,                  -- docTipo: CRLV, CRV, LAUDO, IPVA, etc.
  number TEXT,                -- docNumero
  issue_date DATE,            -- docData
  expiry_date DATE,           -- docValidade
  file_url TEXT,              -- docArquivo
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle ON vehicle_documents(vehicle_id);

-- tbVeiculoDocumentoCompra → vehicle_purchase_documents
CREATE TABLE IF NOT EXISTS vehicle_purchase_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- dcoID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  type TEXT,                  -- dcoTipo: NF, RECIBO, CONTRATO, etc.
  number TEXT,                -- dcoNumero
  issue_date DATE,            -- dcoData
  amount DECIMAL(12,2),
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_purchase_docs_vehicle ON vehicle_purchase_documents(vehicle_id);

-- tbVeiculoMulta → vehicle_fines
CREATE TABLE IF NOT EXISTS vehicle_fines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- mulID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  date DATE,                  -- mulData
  description TEXT,           -- mulDescri
  amount DECIMAL(12,2),       -- mulValor
  issuing_agency TEXT,        -- mulOrgao
  infraction_code TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_fines_vehicle ON vehicle_fines(vehicle_id);

-- tbVeiculoOpcionais → vehicle_optionals
CREATE TABLE IF NOT EXISTS vehicle_optionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- voID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  optional_external_id TEXT,  -- opcID
  optional_id UUID REFERENCES optionals(id),
  name TEXT,                  -- voDescri or opcDescri
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_optionals_vehicle ON vehicle_optionals(vehicle_id);

-- tbVeiculoPendencia → vehicle_pendencies
CREATE TABLE IF NOT EXISTS vehicle_pendencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- vpnID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  standard_pendency_external_id TEXT, -- ppnID
  standard_pendency_id UUID REFERENCES standard_pendencies(id),
  description TEXT,           -- vpnDescri
  status TEXT DEFAULT 'pending', -- vpnStatus: pending, resolved, cancelled
  date DATE,                  -- vpnData
  amount DECIMAL(12,2),       -- vpnValor
  resolved_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_pendencies_vehicle ON vehicle_pendencies(vehicle_id);

-- tbVeiculoProtocoloEntrega → vehicle_delivery_protocols
CREATE TABLE IF NOT EXISTS vehicle_delivery_protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- proID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  customer_external_id TEXT,
  customer_id UUID REFERENCES customers(id),
  delivery_date DATE,         -- proData
  mileage INTEGER,            -- proKM
  fuel_level TEXT,
  description TEXT,           -- proDescri
  signature_url TEXT,         -- proAssinatura
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_protocols_vehicle ON vehicle_delivery_protocols(vehicle_id);

-- tbveiculoTroca → vehicle_trades
CREATE TABLE IF NOT EXISTS vehicle_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- trcID
  -- vehicle received from customer
  incoming_vehicle_external_id TEXT,
  incoming_vehicle_id UUID REFERENCES vehicles(id),
  -- vehicle given to customer
  outgoing_vehicle_external_id TEXT,
  outgoing_vehicle_id UUID REFERENCES vehicles(id),
  customer_external_id TEXT,
  customer_id UUID REFERENCES customers(id),
  trade_date DATE,
  trade_in_value DECIMAL(12,2),  -- value attributed to incoming vehicle
  difference_amount DECIMAL(12,2), -- amount customer pays additionally
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_trades_incoming ON vehicle_trades(incoming_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_trades_outgoing ON vehicle_trades(outgoing_vehicle_id);

-- tbRateioVeiculo → vehicle_apportionment (cost allocation per vehicle)
CREATE TABLE IF NOT EXISTS vehicle_apportionment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- ratID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  plan_account_external_id TEXT, -- plaID
  plan_account_id UUID REFERENCES plan_accounts(id),
  amount DECIMAL(12,2),       -- ratValor
  date DATE,                  -- ratData
  description TEXT,           -- ratDescri
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_apportionment_vehicle ON vehicle_apportionment(vehicle_id);

-- tbDespesaPosVenda → post_sale_expenses
CREATE TABLE IF NOT EXISTS post_sale_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- dpvID
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  description TEXT,           -- dpvDescri
  amount DECIMAL(12,2),       -- dpvValor
  date DATE,                  -- dpvData
  plan_account_external_id TEXT,
  plan_account_id UUID REFERENCES plan_accounts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_post_sale_expenses_vehicle ON post_sale_expenses(vehicle_id);

-- ================================================
-- ORDERS & FOLLOW-UP
-- ================================================

-- tbPedidosClientes → orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- pedID
  customer_external_id TEXT,
  customer_id UUID REFERENCES customers(id),
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  employee_external_id TEXT,
  employee_id UUID REFERENCES employees(id),
  order_date DATE,            -- pedData
  amount DECIMAL(12,2),       -- pedValor
  status TEXT DEFAULT 'open', -- pedStatus: open, approved, cancelled, completed
  payment_method TEXT,
  down_payment DECIMAL(12,2),
  cancellation_reason_id UUID REFERENCES cancellation_reasons(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_dealership ON orders(dealership_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_vehicle ON orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);

-- tbPedidosFollowUp → order_followups
CREATE TABLE IF NOT EXISTS order_followups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- fupID
  order_external_id TEXT,
  order_id UUID REFERENCES orders(id),
  employee_external_id TEXT,
  employee_id UUID REFERENCES employees(id),
  date DATE,                  -- fupData
  description TEXT,           -- fupDescri
  status TEXT,                -- fupStatus
  next_contact DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_order_followups_order ON order_followups(order_id);

-- ================================================
-- FISCAL / NFe (Electronic Invoice)
-- ================================================

-- tbNFe ide → nfe_ide (NFe identification header)
CREATE TABLE IF NOT EXISTS nfe_ide (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,           -- nfeID (internal MDB key)
  access_key TEXT,            -- 44-digit chave de acesso
  nfe_number TEXT,            -- nNF
  series TEXT,                -- serie
  model TEXT,                 -- mod: 55=NF-e, 65=NFC-e
  issue_date TIMESTAMP WITH TIME ZONE, -- dhEmi
  nature_of_operation TEXT,   -- natOp
  operation_type SMALLINT,    -- tpNF: 0=entrada, 1=saída
  total_value DECIMAL(15,2),  -- vNF
  status TEXT DEFAULT 'pending', -- pending, authorized, cancelled, denied
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  xml_url TEXT,
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_nfe_ide_dealership ON nfe_ide(dealership_id);
CREATE INDEX IF NOT EXISTS idx_nfe_ide_vehicle ON nfe_ide(vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfe_ide_access_key
  ON nfe_ide(dealership_id, access_key)
  WHERE access_key IS NOT NULL;

-- tbNFe emit → nfe_emit (NFe emitter)
CREATE TABLE IF NOT EXISTS nfe_emit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,
  nfe_external_id TEXT,
  nfe_id UUID REFERENCES nfe_ide(id),
  cnpj TEXT,
  name TEXT,                  -- xNome
  trade_name TEXT,            -- xFant
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  ie TEXT,                    -- inscrição estadual
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbNFe dest → nfe_dest (NFe destination / buyer)
CREATE TABLE IF NOT EXISTS nfe_dest (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,
  nfe_external_id TEXT,
  nfe_id UUID REFERENCES nfe_ide(id),
  cpf_cnpj TEXT,
  name TEXT,                  -- xNome
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  email TEXT,
  ie TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);

-- tbNFe prod → nfe_prod (NFe product lines)
CREATE TABLE IF NOT EXISTS nfe_prod (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  external_id TEXT,
  nfe_external_id TEXT,
  nfe_id UUID REFERENCES nfe_ide(id),
  product_code TEXT,          -- cProd
  ean TEXT,
  description TEXT,           -- xProd
  ncm_code TEXT,              -- NCM
  cfop TEXT,
  unit TEXT,                  -- uCom
  quantity DECIMAL(15,4),     -- qCom
  unit_value DECIMAL(15,4),   -- vUnCom
  total_value DECIMAL(15,2),  -- vProd
  vehicle_external_id TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dealership_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_nfe_prod_nfe ON nfe_prod(nfe_id);

-- ================================================
-- REPORTING VIEW (replaces tbVisaoGeralMovimentacao)
-- ================================================
CREATE OR REPLACE VIEW visao_geral_movimentacao AS
SELECT
  v.id,
  v.dealership_id,
  v.external_id                                    AS car_id,
  v.plate,
  v.brand,
  v.model,
  v.version,
  v.year_fab,
  v.year_model,
  v.color,
  v.mileage,
  v.fuel,
  v.purchase_price,
  v.sale_price,
  v.fipe_price,
  v.purchase_date,
  v.sale_date,
  v.status,
  v.source,
  COALESCE(
    (SELECT SUM(e.amount) FROM expenses e WHERE e.vehicle_id = v.id),
    0
  )                                                AS total_expenses,
  COALESCE(v.sale_price, 0)
    - v.purchase_price
    - COALESCE(
        (SELECT SUM(e.amount) FROM expenses e WHERE e.vehicle_id = v.id),
        0
      )                                            AS gross_profit,
  CASE
    WHEN COALESCE(v.sale_price, 0) > 0 THEN ROUND(
      (
        (COALESCE(v.sale_price, 0)
          - v.purchase_price
          - COALESCE(
              (SELECT SUM(e.amount) FROM expenses e WHERE e.vehicle_id = v.id),
              0
            )
        ) / v.sale_price * 100
      )::numeric, 2
    )
    ELSE 0
  END                                              AS profit_percent,
  CASE
    WHEN v.sale_date IS NOT NULL THEN (v.sale_date - v.purchase_date)
    ELSE (CURRENT_DATE - v.purchase_date)
  END                                              AS days_in_stock
FROM vehicles v;

-- ================================================
-- ROW LEVEL SECURITY
-- ================================================
-- imports already has RLS from 001_initial.sql
ALTER TABLE manufacturers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_types                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE banks                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_standards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_origins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_complements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_commercial_data   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_asset_references  ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_data              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_data                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE financings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurances                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_purchase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_fines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE optionals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_optionals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_pendencies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_delivery_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_trades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_apportionment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_sale_expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_pendencies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_reasons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_followups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_enumerations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE text_configurations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncm                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nature_of_operation        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_ide                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_emit                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_dest                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_prod                   ENABLE ROW LEVEL SECURITY;

-- Generic helper: all new tables are scoped to dealership
-- imports policy already exists in 001_initial.sql

CREATE POLICY "manufacturers_dealership_policy" ON manufacturers FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "fuel_types_dealership_policy" ON fuel_types FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "plan_accounts_dealership_policy" ON plan_accounts FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "banks_dealership_policy" ON banks FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "bank_accounts_dealership_policy" ON bank_accounts FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "employees_dealership_policy" ON employees FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "employee_salaries_dealership_policy" ON employee_salaries FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "commissions_dealership_policy" ON commissions FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "commission_standards_dealership_policy" ON commission_standards FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "customer_origins_dealership_policy" ON customer_origins FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "customer_complements_dealership_policy" ON customer_complements FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "customer_commercial_data_dealership_policy" ON customer_commercial_data FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "customer_asset_references_dealership_policy" ON customer_asset_references FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "purchase_data_dealership_policy" ON purchase_data FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "sale_data_dealership_policy" ON sale_data FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "financings_dealership_policy" ON financings FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "insurances_dealership_policy" ON insurances FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_documents_dealership_policy" ON vehicle_documents FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_purchase_documents_dealership_policy" ON vehicle_purchase_documents FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_fines_dealership_policy" ON vehicle_fines FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "optionals_dealership_policy" ON optionals FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_optionals_dealership_policy" ON vehicle_optionals FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_pendencies_dealership_policy" ON vehicle_pendencies FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_delivery_protocols_dealership_policy" ON vehicle_delivery_protocols FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_trades_dealership_policy" ON vehicle_trades FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vehicle_apportionment_dealership_policy" ON vehicle_apportionment FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "standard_expenses_dealership_policy" ON standard_expenses FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "post_sale_expenses_dealership_policy" ON post_sale_expenses FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "standard_pendencies_dealership_policy" ON standard_pendencies FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "cancellation_reasons_dealership_policy" ON cancellation_reasons FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "orders_dealership_policy" ON orders FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "order_followups_dealership_policy" ON order_followups FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "general_enumerations_dealership_policy" ON general_enumerations FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "text_configurations_dealership_policy" ON text_configurations FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "ncm_dealership_policy" ON ncm FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "nature_of_operation_dealership_policy" ON nature_of_operation FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "nfe_ide_dealership_policy" ON nfe_ide FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "nfe_emit_dealership_policy" ON nfe_emit FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "nfe_dest_dealership_policy" ON nfe_dest FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

CREATE POLICY "nfe_prod_dealership_policy" ON nfe_prod FOR ALL
  USING (dealership_id IN (SELECT dealership_id FROM users WHERE id = auth.uid()));

-- ================================================
-- TRIGGERS (updated_at for mutable tables)
-- ================================================

-- Create the helper function if it doesn't already exist
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bank_accounts_timestamp
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_employees_timestamp
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_financings_timestamp
  BEFORE UPDATE ON financings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_orders_timestamp
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_text_configurations_timestamp
  BEFORE UPDATE ON text_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customers_timestamp
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_vendors_timestamp
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================
-- FIX get_dashboard_stats: derive monthly metrics
-- from vehicles (imported data), not the sales table
-- ================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats(d_id uuid)
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'total_vehicles',     count(*) FILTER (WHERE status != 'sold'),
    'available_vehicles', count(*) FILTER (WHERE status = 'available'),
    'critical_vehicles',  count(*) FILTER (WHERE status = 'available' AND days_in_stock > 60),
    'avg_days_in_stock',  COALESCE(ROUND(AVG(days_in_stock) FILTER (WHERE status = 'available')), 0),
    'total_expenses',     COALESCE((SELECT SUM(amount) FROM expenses WHERE dealership_id = d_id), 0),
    -- Monthly sales derived from vehicles.sale_date (populated by import)
    'monthly_sales',      COUNT(*) FILTER (WHERE status = 'sold' AND sale_date >= DATE_TRUNC('month', CURRENT_DATE)),
    'monthly_revenue',    COALESCE(SUM(sale_price) FILTER (WHERE status = 'sold' AND sale_date >= DATE_TRUNC('month', CURRENT_DATE)), 0),
    -- Monthly profit = sale_price - purchase_price - expenses per vehicle
    'monthly_profit',     COALESCE((
      SELECT SUM(v.sale_price - v.purchase_price - COALESCE(e.total_exp, 0))
      FROM vehicles v
      LEFT JOIN (
        SELECT vehicle_id, SUM(amount) AS total_exp
        FROM expenses
        WHERE dealership_id = d_id
        GROUP BY vehicle_id
      ) e ON e.vehicle_id = v.id
      WHERE v.dealership_id = d_id
        AND v.status = 'sold'
        AND v.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
    ), 0)
  )
  FROM vehicles
  WHERE dealership_id = d_id;
$$;
