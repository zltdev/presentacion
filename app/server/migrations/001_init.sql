-- Esquema inicial de la web app de presentaciones (PJW-004)

CREATE TABLE users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'presenter', 'editor')),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- id = sha256 del token de la cookie: la DB nunca guarda el token en claro
CREATE TABLE sessions (
  id         text PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id ON sessions(user_id);

-- sections: ids de <section> en orden; hidden: ids de elementos ocultos (catálogo, PJW-006)
CREATE TABLE presentations (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  lang       text NOT NULL DEFAULT 'es' CHECK (lang IN ('es', 'en')),
  sections   jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sections) = 'array'),
  hidden     jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(hidden) = 'array'),
  is_fixed   boolean NOT NULL DEFAULT false, -- "Web completa": no se edita ni se borra
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX presentations_one_fixed ON presentations(is_fixed) WHERE is_fixed;

-- Textos corregidos globales; original_hash detecta si un export nuevo cambió el texto base
CREATE TABLE text_overrides (
  element_id    text NOT NULL,
  lang          text NOT NULL CHECK (lang IN ('es', 'en')),
  text          text NOT NULL,
  original_hash text NOT NULL,
  updated_by    int REFERENCES users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (element_id, lang)
);

CREATE TABLE contacts (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  first_sent_at timestamptz NOT NULL DEFAULT now()
);

-- presentation_name queda copiado: el historial sobrevive si se borra la presentación
CREATE TABLE sends (
  id                serial PRIMARY KEY,
  presentation_id   int REFERENCES presentations(id) ON DELETE SET NULL,
  presentation_name text NOT NULL,
  user_id           int REFERENCES users(id) ON DELETE SET NULL,
  pdf_bytes         int,
  mode              text CHECK (mode IN ('attachment', 'link')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE send_recipients (
  send_id    int NOT NULL REFERENCES sends(id) ON DELETE CASCADE,
  contact_id int NOT NULL REFERENCES contacts(id),
  PRIMARY KEY (send_id, contact_id)
);
