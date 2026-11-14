-- Fase kontrak: trips sudah menjadi agregat tunggal.
-- Tabel lama dan kolom mati dihapus setelah fase expand + code switch terbukti.

DROP TABLE IF EXISTS "itinerary";

ALTER TABLE "trips"
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "end_date",
  DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "is_archived";
