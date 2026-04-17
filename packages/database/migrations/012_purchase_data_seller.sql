-- Add seller (customer who sold the vehicle) fields to purchase_data.
-- Per schema standard: tbDadosCompra.cliID → tbCliente (the person selling the vehicle to the dealer).
-- This is DIFFERENT from supplier_external_id (tbFornecedor = business vendor/service provider).

ALTER TABLE purchase_data
  ADD COLUMN IF NOT EXISTS seller_customer_external_id TEXT,
  ADD COLUMN IF NOT EXISTS seller_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_data_seller_customer ON purchase_data(seller_customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_data_supplier ON purchase_data(supplier_id);
