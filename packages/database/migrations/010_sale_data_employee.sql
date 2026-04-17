-- Add salesperson fields to sale_data
-- tbDadosVenda may contain vVendedorID (funID) identifying the salesperson who closed the sale.
-- This is the most direct vehicle→salesperson link available in the source MDB.

ALTER TABLE sale_data
  ADD COLUMN IF NOT EXISTS employee_external_id TEXT,   -- vVendedorID / vFunID (funID of salesperson)
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);

CREATE INDEX IF NOT EXISTS idx_sale_data_employee ON sale_data(employee_id);
