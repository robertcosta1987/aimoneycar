-- ================================================
-- MONEYCAR AI - DATABASE SCHEMA
-- ================================================
-- Supabase PostgreSQL schema for car dealership intelligence platform

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- DEALERSHIPS (Tenants)
-- ================================================
CREATE TABLE dealerships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  cnpj VARCHAR(18),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- USERS
-- ================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'staff', -- owner, manager, staff
  avatar_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  
  -- Vehicle info
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  version VARCHAR(100),
  year_fab INTEGER NOT NULL,
  year_model INTEGER NOT NULL,
  color VARCHAR(50),
  mileage INTEGER DEFAULT 0,
  fuel VARCHAR(20), -- FLEX, GASOLINA, DIESEL, ELÉTRICO, HÍBRIDO
  transmission VARCHAR(20), -- MANUAL, AUTOMÁTICO, CVT
  doors INTEGER,
  engine VARCHAR(20),
  
  -- Financial
  purchase_price DECIMAL(12,2) NOT NULL,
  sale_price DECIMAL(12,2),
  fipe_price DECIMAL(12,2),
  min_price DECIMAL(12,2),
  
  -- Status
  status VARCHAR(20) DEFAULT 'available', -- available, reserved, sold, consigned
  
  -- Dates
  purchase_date DATE NOT NULL,
  sale_date DATE,
  
  -- Supplier/Customer
  supplier_id UUID,
  supplier_name VARCHAR(255),
  customer_id UUID,
  
  -- Media
  photos TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  
  -- Metadata
  notes TEXT,
  source VARCHAR(50), -- COMPRA, TROCA, CONSIGNAÇÃO
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for vehicles
CREATE INDEX idx_vehicles_dealership ON vehicles(dealership_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_plate ON vehicles(plate);
CREATE INDEX idx_vehicles_purchase_date ON vehicles(purchase_date);

-- ================================================
-- EXPENSES
-- ================================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  
  category VARCHAR(50) NOT NULL, -- DESPACHANTE, LAVAGEM, MECÂNICA, FUNILARIA, IPVA, etc
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL,
  
  vendor_name VARCHAR(255),
  vendor_id UUID,
  
  payment_method VARCHAR(50), -- PIX, DINHEIRO, CARTÃO, BOLETO
  receipt_url TEXT,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_expenses_dealership ON expenses(dealership_id);
CREATE INDEX idx_expenses_vehicle ON expenses(vehicle_id);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date ON expenses(date);

-- ================================================
-- SALES
-- ================================================
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  
  -- Customer
  customer_id UUID,
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
  payment_method VARCHAR(50) NOT NULL, -- PIX, FINANCIAMENTO, CARTÃO, À VISTA
  down_payment DECIMAL(12,2),
  financing_bank VARCHAR(100),
  installments INTEGER,
  
  -- Details
  sale_date DATE NOT NULL,
  salesperson_id UUID REFERENCES users(id),
  salesperson_name VARCHAR(255),
  
  notes TEXT,
  contract_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sales_dealership ON sales(dealership_id);
CREATE INDEX idx_sales_vehicle ON sales(vehicle_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_salesperson ON sales(salesperson_id);

-- ================================================
-- CUSTOMERS
-- ================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  cpf VARCHAR(14),
  
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  
  source VARCHAR(50), -- OLX, WEBMOTORS, INSTAGRAM, INDICAÇÃO, LOJA
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_customers_dealership ON customers(dealership_id);
CREATE INDEX idx_customers_phone ON customers(phone);

-- ================================================
-- VENDORS (Suppliers/Service providers)
-- ================================================
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50), -- DESPACHANTE, MECÂNICA, FUNILARIA, LAVAGEM, etc
  phone VARCHAR(20),
  email VARCHAR(255),
  cnpj VARCHAR(18),
  
  address TEXT,
  city VARCHAR(100),
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_alerts_dealership ON ai_alerts(dealership_id);
CREATE INDEX idx_alerts_unread ON ai_alerts(dealership_id, is_read, is_dismissed);

-- ================================================
-- AI CHAT HISTORY
-- ================================================
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  
  messages JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================
ALTER TABLE dealerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own dealership data
CREATE POLICY "Users can view own dealership"
  ON dealerships FOR SELECT
  USING (id IN (
    SELECT dealership_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view own user data"
  ON users FOR SELECT
  USING (id = auth.uid() OR dealership_id IN (
    SELECT dealership_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view dealership vehicles"
  ON vehicles FOR ALL
  USING (dealership_id IN (
    SELECT dealership_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view dealership expenses"
  ON expenses FOR ALL
  USING (dealership_id IN (
    SELECT dealership_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view dealership sales"
  ON sales FOR ALL
  USING (dealership_id IN (
    SELECT dealership_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view dealership customers"
  ON customers FOR ALL
  USING (dealership_id IN (
    SELECT dealership_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view dealership alerts"
  ON ai_alerts FOR ALL
  USING (dealership_id IN (
    SELECT dealership_id FROM users WHERE id = auth.uid()
  ));

-- ================================================
-- FUNCTIONS
-- ================================================

-- Calculate vehicle margin
CREATE OR REPLACE FUNCTION calculate_vehicle_margin(v_id UUID)
RETURNS TABLE (
  total_expenses DECIMAL,
  margin DECIMAL,
  margin_percent DECIMAL
) AS $$
DECLARE
  v_purchase_price DECIMAL;
  v_sale_price DECIMAL;
  v_expenses DECIMAL;
BEGIN
  SELECT purchase_price, sale_price INTO v_purchase_price, v_sale_price
  FROM vehicles WHERE id = v_id;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses
  FROM expenses WHERE vehicle_id = v_id;
  
  RETURN QUERY SELECT 
    v_expenses,
    v_sale_price - v_purchase_price - v_expenses,
    CASE WHEN v_sale_price > 0 
      THEN ((v_sale_price - v_purchase_price - v_expenses) / v_sale_price) * 100
      ELSE 0
    END;
END;
$$ LANGUAGE plpgsql;

-- Get vehicle days in stock
CREATE OR REPLACE FUNCTION get_days_in_stock(v_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_purchase_date DATE;
  v_sale_date DATE;
BEGIN
  SELECT purchase_date, sale_date INTO v_purchase_date, v_sale_date
  FROM vehicles WHERE id = v_id;
  
  IF v_sale_date IS NOT NULL THEN
    RETURN v_sale_date - v_purchase_date;
  ELSE
    RETURN CURRENT_DATE - v_purchase_date;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- TRIGGERS
-- ================================================

-- Update timestamp on modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vehicles_timestamp
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_expenses_timestamp
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sales_timestamp
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
