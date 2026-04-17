-- Fix FK on calendario_config.ultimo_salesperson_id so it nulls automatically
-- when the referenced employee is deleted, instead of blocking the delete.

ALTER TABLE calendario_config
  DROP CONSTRAINT IF EXISTS calendario_config_ultimo_salesperson_id_fkey;

ALTER TABLE calendario_config
  ADD CONSTRAINT calendario_config_ultimo_salesperson_id_fkey
  FOREIGN KEY (ultimo_salesperson_id)
  REFERENCES employees(id)
  ON DELETE SET NULL;
