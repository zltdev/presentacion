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
- VPS `2.25.176.236` (Ubuntu 24.04). Deploy por **Dokploy** (así se despliega todo en el
  VPS): app compose con API Node (Fastify) + `postgres:17-alpine` propio, `mem_limit: 1g`,
  `shm_size: 256m`. Dokploy conectado al repo, auto-deploy en push a `zltdev/webapp`.
  Traefik de Dokploy hace el TLS. Backup diario de Postgres. Pendientes de Claudio en
  `vps-claudio.md` (auditoría de RAM, swap).
- Dominio: durante el hito `beta-proyectos.zltdesarrollos.com` (zona que maneja Facu;
  primero el A record, después el dominio en Dokploy). En el lanzamiento (T14)
  `proyectos.somoszlt.com` (zona del compañero de Facu) pasa del GitHub Pages al VPS y
  `beta-` redirige. `/` presentación publicada, `/admin` backoffice, `/api` API,
  `/brochures/*.pdf` en las mismas rutas de hoy. Todo servido por el VPS (sin Vercel: un solo deploy, el HTML de 27 MB no pasa
  por intermediarios, y el plan gratis de Vercel no admite uso comercial).
- Tras el lanzamiento la web original completa sigue disponible como presentación fija
  "Web completa" (detrás del login). Este hito cubre el alcance de PJW-001.
- CI: tests en cada PR/push (GitHub Actions); el deploy lo hace Dokploy.

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

## Publicación (cambio del 2026-10-09)
- Las presentaciones y sus opciones solo se ven en `/admin`. El CEO o Conra eligen una y la
  **publican**: `/` muestra siempre la publicada. Una sola publicada a la vez; por defecto
  "Web completa" (así el lanzamiento se ve igual que hoy).
- Para mostrar otra en vivo sin publicarla: vista previa desde `/admin`.

## Login y roles
- Mismo login en `/` y en `/admin`; la URL decide el destino (no hay botones
  Presentar/Administrar). Argon2id, cookie de sesión httpOnly/Secure/SameSite=Lax,
  bloqueo tras 5 intentos.
- Internos con clave: admin (Facu, facundo_r@somoszlt.com): todo + usuarios. presentador
  (CEO, gino@somoszlt.com): armar/editar/publicar/presentar/enviar PDF. editor (Conra,
  conrado@somoszlt.com): textos globales y publicar; no envía PDFs.
- **Visitantes** (reemplazo real de `gate.js`): solo ven la presentación publicada. Se dan
  de alta desde `/admin` y entran por **magic link** (link de un solo uso, 15 min, verifica
  el correo); sesión de 30 días; se pueden dar de baja. Casilla remitente de los magic
  links: **a definir por Facu** (opciones: casilla nueva con su propia app de Azure,
  ampliar la app del PDF, o servicio externo tipo Resend).

## PDF por mail
- Playwright imprime la presentación con CSS de impresión (galerías expandidas, videos
  como miniatura + link).
- Envío por Microsoft Graph desde la casilla del CEO. ≤ ~20 MB adjunto; si no, link de
  descarga firmado que vence a los 30 días.
- Postgres guarda `contacts` (email único) y `sends` (presentación, quién, a quién, cuándo,
  tamaño, estado).
