# Indicaciones para Claudio — VPS Hostinger (web app de proyectos)

VPS: `2.25.176.236`, Ubuntu 24.04, 4 vCPU, 16 GB RAM, Dokploy + Traefik.
Relevamiento del 2026-10-09 (sesión hostinger-48): **1,9 GB de RAM disponibles, 0 swap**,
~40 containers de producción. Sin red: si algo se pasa de memoria, el OOM killer puede tirar
cualquier servicio (Chatwoot, n8n, ERP, etc.).

## 1. Auditar el consumo de RAM y dar de baja lo que no se usa (pedido de Facu)
Facu estima que no hay tantos servicios en uso y que hay memoria para liberar.
- La sesión hostinger-48 arma la tabla: container, stack, RAM, actividad de los últimos 30 días
  y si parece abandonado o duplicado (dev/stg sin uso, previews `*.sslip.io`, etc.).
- Con esa tabla, Facu y Claudio deciden qué se apaga. Antes de borrar: backup de los volúmenes
  del stack y apagado primero (no borrado) durante una semana.
- Objetivo: dejar al menos 4 GB disponibles de forma estable.

### Resultado del relevamiento (hostinger-48, 2026-10-09, sin apagar nada)
Se libera ~6,4 GB (de 1,9 a ~8,3 GB disponibles). Nada fuera de Docker pesa más de 50 MB.

| # | Qué | Libera | Evidencia | Riesgo |
|---|---|---|---|---|
| 1 | openclaw (openclaw-1 + openclaw-browser-1) | 4.706 MB | 130.975 eventos en 30 días, todos con `clients=0`; el browser no loguea desde el 15/06 | Ninguno aparente |
| 2 | Twenty CRM (server, worker, postgres, redis) | 1.377 MB | El server no recibió un request en 30 días; el worker corre crons para nadie | **Tiene datos**: exportar o archivar el volumen antes de borrar |
| 3 | Flowise | 356 MB | 5 líneas de log en 30 días | Confirmar con quien lo montó |
| 4 | floci-aws | 21 MB | Mudo desde el 17/08; su DNS nunca existió | Ninguno |

**No tocar aunque no logueen:** `zlt-postgrest-dev` y `zlt-postgrest-stg` están en uso
(los `zlt-sync-*` les pegan vía `zlt-rest-proxy`). Volumen de log no indica uso.

**Para decidir aparte:** ZLT dev + stg corren duplicados (~740 MB, los dos sincronizando).
`zlt-sync-dev` está expuesto a internet y recibe escaneos de bots.

Orden seguro: parar el container → esperar unos días → recién ahí borrar el volumen. La
sesión hostinger-48 lo ejecuta con el OK de Claudio en su propia sesión.

Si se apagan openclaw y Twenty, el swap del punto 2 deja de ser urgente (sigue siendo
recomendable como red).

## 2. Agregar swap (4 GB)
Red de seguridad que hoy no existe. Necesaria antes de generar PDFs con Chromium (PJW-012).
```
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
```

## 3. Deploy de la web app por Dokploy
- Nueva app compose en Dokploy (API Node + Postgres 17 propio, `mem_limit: 1g`, `shm_size: 256m`).
- Conectar Dokploy al repo `zltdev/presentacion`, rama `zltdev/webapp`, con auto-deploy por
  webhook. Es el primer proyecto del VPS que despliega desde git: requiere autorizar la GitHub
  App de Dokploy sobre ese repo.
- Dominio: Facu crea primero el A record `beta-proyectos.zltdesarrollos.com → 2.25.176.236`; recién
  después se carga el dominio en Dokploy (si se carga antes, ACME queda en backoff y hay que
  reiniciar `dokploy-traefik`).
- Backup diario del Postgres de la app, retención 14 días.
