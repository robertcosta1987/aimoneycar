-- Migration 013: Fix get_dashboard_stats performance
--
-- The previous version aggregated ALL expenses for the dealership before
-- joining to vehicles, causing a statement timeout on large databases
-- (e.g. 10k+ vehicles, 500k+ expense records).
--
-- This version uses a CTE to first identify recently-sold vehicles,
-- then only aggregates expenses for those vehicles — making monthly_profit
-- O(recent sales) instead of O(all expenses).

CREATE OR REPLACE FUNCTION get_dashboard_stats(d_id uuid)
RETURNS json
LANGUAGE sql
STABLE
AS $$
  WITH recent_sales AS (
    SELECT id, sale_price, purchase_price
    FROM vehicles
    WHERE dealership_id = d_id
      AND status = 'sold'
      AND sale_date >= CURRENT_DATE - INTERVAL '30 days'
  ),
  recent_expenses AS (
    SELECT vehicle_id, SUM(amount) AS total_exp
    FROM expenses
    WHERE vehicle_id IN (SELECT id FROM recent_sales)
    GROUP BY vehicle_id
  )
  SELECT json_build_object(
    'total_vehicles',
      (SELECT count(*) FROM vehicles WHERE dealership_id = d_id AND status != 'sold'),
    'available_vehicles',
      (SELECT count(*) FROM vehicles WHERE dealership_id = d_id AND status = 'available'),
    'critical_vehicles',
      (SELECT count(*) FROM vehicles WHERE dealership_id = d_id AND status = 'available' AND days_in_stock > 60),
    'avg_days_in_stock',
      COALESCE((SELECT ROUND(AVG(days_in_stock)) FROM vehicles WHERE dealership_id = d_id AND status = 'available'), 0),
    'total_expenses',
      COALESCE((SELECT SUM(amount) FROM expenses WHERE dealership_id = d_id), 0),
    'monthly_sales',
      (SELECT count(*) FROM recent_sales),
    'monthly_revenue',
      COALESCE((SELECT SUM(sale_price) FROM recent_sales), 0),
    'monthly_profit',
      COALESCE((
        SELECT SUM(s.sale_price - s.purchase_price - COALESCE(e.total_exp, 0))
        FROM recent_sales s
        LEFT JOIN recent_expenses e ON e.vehicle_id = s.id
      ), 0)
  );
$$;
