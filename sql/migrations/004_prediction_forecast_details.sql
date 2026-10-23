-- Optional details keep existing forecasts readable during a rolling deployment.
ALTER TABLE public.predictions
    ADD COLUMN IF NOT EXISTS forecast_details jsonb;
COMMENT ON COLUMN public.predictions.forecast_details IS
    'Raw calibration inputs, calibrated position marginals, model ranges and sampling diagnostics; v7+';
