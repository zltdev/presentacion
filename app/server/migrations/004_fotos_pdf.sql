-- Fotos elegidas para el PDF (PJW-012): ids de fotos del catálogo, hasta 2 por sección.
-- Vacío = el PDF elige las 2 de mayor resolución.
ALTER TABLE presentations ADD COLUMN pdf_photos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(pdf_photos) = 'array');
