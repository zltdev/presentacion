-- Publicación (PJW-017): / muestra la presentación publicada. Una sola a la vez; arranca la Web completa.
ALTER TABLE presentations ADD COLUMN published boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX presentations_one_published ON presentations(published) WHERE published;
UPDATE presentations SET published = true WHERE is_fixed;
