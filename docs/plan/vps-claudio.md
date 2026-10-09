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
- Dominio: Facu crea primero el A record `beta-proyectos.somoszlt.com → 2.25.176.236`; recién
  después se carga el dominio en Dokploy (si se carga antes, ACME queda en backoff y hay que
  reiniciar `dokploy-traefik`).
- Backup diario del Postgres de la app, retención 14 días.
