-- Migration 014: Add missing indexes on high-traffic columns
--
-- expenses and vehicles had no indexes on their most-queried columns.
-- Without these, every nested join (expenses:expenses(amount)) and
-- every status/date filter on vehicles does a full table scan —
-- causing statement timeouts on large databases (10k+ vehicles,
-- 500k+ expense records).

-- expenses: indexed by vehicle and dealership (used in every join)
CREATE INDEX IF NOT EXISTS idx_expenses_vehicle_id    ON expenses(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_expenses_dealership_id ON expenses(dealership_id);

-- vehicles: dealership + status composite (envelhecimento, relatorios, custos)
CREATE INDEX IF NOT EXISTS idx_vehicles_dealership_id        ON vehicles(dealership_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_dealership_status    ON vehicles(dealership_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_dealership_sale_date ON vehicles(dealership_id, sale_date);
