-- Adds the portion the AI committed to when logging the meal. Exists so
-- the user can see and verify that assumption — silent guesses about
-- portion size used to break daily calorie totals (Budweiser Magnum
-- assumed 500ml when it might be 650ml, half kachori vs full, etc.).
--
-- Existing rows get NULL; the column is required for new inserts at the
-- application layer.

ALTER TABLE meals ADD COLUMN portion_assumed TEXT;
