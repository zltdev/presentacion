# Web app de presentaciones — spec

Aprobada por Facu el 2026-10-08. Las tareas están en `webapp-tareas.json`.

## Qué es
Backoffice para que el CEO arme "presentaciones" a partir de la web actual (`index.html`):
elige qué secciones y qué elementos se muestran, en qué orden y en qué idioma, y las
presenta en vivo frente a clientes/inversores. Al terminar puede mandar el PDF de lo que
presentó a los correos que le den; esos correos quedan guardados.

## Reglas que no se negocian
- **La web base no se toca.** `index.html` lo sigue produciendo Conra (marketing) con el
  flujo de siempre. La app lo lee; nunca lo reescribe.
- **proyectos.somoszlt.com sigue activo en GitHub Pages hasta el lanzamiento** (T14).
  Nada se pushea a `main` antes.
- **La app de Azure solo sirve para esto:** permiso `Mail.Send` limitado por política de
  Exchange a la casilla del CEO. Nada de lectura de correo ni de otras casillas.
- Repo público: secretos solo en variables de entorno del VPS / GitHub Secrets.

## Repo y ramas
- Código en `app/` (`app/server`, `app/web`). Raíz del sitio estático intacta.
- Rama de integración: `zltdev/webapp`. Cada tarea en `PJW-###-slug`, mergea a la de
  integración; esa se despliega al VPS. Lanzamiento = merge a `main` (T14).

## Infra (VPS Hostinger, en conjunto con el agente del repo de Hostinger)
- Docker compose: Caddy (TLS) + API Node (Fastify) + Postgres. Backup diario de Postgres.
- Dominio: durante el hito `beta-proyectos.somoszlt.com`. En el lanzamiento (T14)
  `proyectos.somoszlt.com` pasa del GitHub Pages al VPS y `beta-` redirige.
  `/` presentar, `/admin` backoffice, `/api` API, `/brochures/*.pdf` en las mismas rutas
  de hoy. Todo servido por el VPS (sin Vercel: un solo deploy, el HTML de 27 MB no pasa
  por intermediarios, y el plan gratis de Vercel no admite uso comercial).
- Tras el lanzamiento la web original completa sigue disponible como presentación fija
  "Web completa" (detrás del login). Este hito cubre el alcance de PJW-001.
- CI: tests en cada PR/push; deploy al VPS en push a `zltdev/webapp` con tests en verde.

## Catálogo y render
- **Catálogo:** parser de `index.html` → secciones (`<section id>`, 27 hoy) y elementos
  dentro: video (`.pvideo`), cada foto de galería (`.gslide`), textos (`.prose` y demás
  bloques `l-es`/`l-en`), partners (`.accompany`), etapas (`.stages`), brochure.
  ID estable = sección + tipo + hash del contenido.
- **Presentación:** nombre, idioma (es|en), secciones ordenadas, elementos ocultos.
  Compartidas entre todos los usuarios.
- **Render:** quita/reordena, regenera contador y puntos de galerías, aplica textos
  corregidos, fija idioma, quita `gate.js` (lo reemplaza el login real).
- **Textos corregidos:** globales (aplican a todas las presentaciones), guardados en la
  app con el hash del texto original. No tocan la web base.
- **Sync:** al cambiar `index.html` en `main`, una Action lo sube al VPS; el admin lista
  selecciones y textos que dejaron de coincidir.

## Login y roles
- Un login, elección "Presentar" (`/`) o "Administrar" (`/admin`). Argon2id, cookie de
  sesión httpOnly/Secure/SameSite=Lax, rate limit.
- admin (Facu): todo + usuarios. presentador (CEO): armar/editar/presentar/enviar PDF.
  editor (Conra): textos globales; no envía PDFs. 3 usuarios, no hay más.

## PDF por mail
- Playwright imprime la presentación con CSS de impresión (galerías expandidas, videos
  como miniatura + link).
- Envío por Microsoft Graph desde la casilla del CEO. ≤ ~20 MB adjunto; si no, link de
  descarga firmado que vence a los 30 días.
- Postgres guarda `contacts` (email único) y `sends` (presentación, quién, a quién, cuándo,
  tamaño, estado).
