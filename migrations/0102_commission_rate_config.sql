ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS commission_rates jsonb NOT NULL DEFAULT '{"city":"اصفهان","saleTotalPercent":0.5,"rentDepositPercent":0.5,"rentMonthlyPercent":25,"vatPercent":10,"sourceLabel":"","sourceUrl":"","effectiveFrom":"","effectiveTo":"","verified":false}'::jsonb;

COMMENT ON COLUMN site_settings.commission_rates IS
  'Admin-controlled commission assumptions with source and validity metadata; defaults are explicitly unverified estimates.';
