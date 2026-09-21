# presentacion

## Harness / sesiones  ← LEER AL ARRANCAR CADA SESIÓN
El backlog vive en **`docs/harness/feature_list.json`**. Es la fuente única de qué
está hecho / pendiente / bloqueado. Cada feature tiene una key incremental
**PJW-###** (padding a 3 dígitos). `meta.next_key` es el contador de la
próxima key libre. Este archivo lo lee un tablero central (cockpit) que muestra
el estado de todos los repos y puede editar campos blandos (`status`,
`priority`, `horizon`, `start_date`, `target_date`, `description`, `notes`,
`block_*`, `depends_on`) con commits de `cockpit-bot`. Crear features y tocar
`next_key` es SOLO de las sesiones de Claude Code.

**Protocolo de toda sesión de trabajo (no aplica a charlas sueltas):**
1. Leé `docs/harness/feature_list.json` al empezar. Ubicá la feature; si es
   nueva, asignale `meta.next_key`, agregala y subí el contador. Reservá la key
   con un commit chico y directo a la branch principal (solo tu entrada con
   `status: pending` + el contador) antes de abrir la branch de trabajo: dos
   sesiones concurrentes leen el mismo `next_key` y git no avisa.
2. Apenas tengas la key, marcá un capítulo de sesión con la key en el título
   (ej. "PJW-015 · ...") antes de tocar código.
3. Guardá en la feature su `branch` y su `worktree` (`git worktree list`).
4. Nombrá la branch de trabajo **`PJW-###-slug`**.
5. Al cerrar: actualizá `status` (pending→in_progress→done/blocked) y completá
   `branch` + `delivered_in_session`. Respetá `require_tests_to_close`.

Campos por feature: `id`, `key`, `title`, `status` (pending | in_progress |
in_review | blocked | needs_clarification | done | skipped), `epic`, `priority`
(p0 | p1 | p2), `horizon` (now | next | later), `start_date`, `target_date`,
`depends_on` (lista de keys), `branch`, `worktree`, `delivered_in_session`,
`require_tests_to_close`, `acceptance` (lista), `description`, `notes`,
`block_type`, `block_note`.

**Fechas y dependencias (cockpit).** No escribas fecha de alta, de inicio real
ni de cierre: el cockpit las saca del historial git de este archivo. Por eso:
- Anotá la feature **antes** de abrir su branch (paso 1). Si la branch tiene
  commits de antes, el cockpit la marca «anotada tarde».
- Pasala a `in_progress` cuando arranques; no saltes de `pending` a `done`. Esa
  transición es su inicio real si no hay branch.
- `start_date` (YYYY-MM-DD, opcional): cuándo se *planea* arrancar, si no es ya.
  `target_date`: cuándo debería cerrar.
- `depends_on`: keys de las que espera (`["PJW-014"]`), en vez de dejarlo
  solo escrito en la nota.

**No reformatees `feature_list.json`.** Es `indent=1` y LF. Si lo reescribís con
otro estilo (`json.dump` default, o CRLF por escribirlo en Windows sin
`newline="\n"`), agregar una feature produce un diff de cientos de líneas y le
rompe el merge a toda otra sesión que toque el archivo.
