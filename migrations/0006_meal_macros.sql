-- Track full macro breakdown on every meal: calories, protein were already
-- there from earlier migrations. Adding carbs and fat so the AI estimates
-- all four core macros at log time and the user can set targets against
-- any of them (kind='carbs_g' or 'fat_g' in `targets` already works
-- generically; computeTargetProgress just needs to know to sum them).

ALTER TABLE meals ADD COLUMN carbs_g INTEGER;
ALTER TABLE meals ADD COLUMN fat_g   INTEGER;
