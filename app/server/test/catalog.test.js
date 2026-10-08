import { test, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCatalog } from '../src/catalog.js'

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8')
let cat
beforeAll(() => { cat = buildCatalog(html) })

const ids = c => c.sections.flatMap(s => [...s.elements, ...s.texts].map(e => e.id))

test('detecta las 27 secciones y las 11 fotos de p-pivm', () => {
  expect(cat.sections).toHaveLength(27)
  const pivm = cat.sections.find(s => s.id === 'p-pivm')
  expect(pivm.title).toBe('Parque Industrial Vaca Muerta')
  expect(pivm.elements.filter(e => e.type === 'foto')).toHaveLength(11)
  expect(pivm.elements.map(e => e.type)).toEqual(expect.arrayContaining(['video', 'texto', 'partners', 'etapas', 'brochure']))
})

test('los IDs son únicos y no cambian al re-parsear', () => {
  const a = ids(cat)
  expect(new Set(a).size).toBe(a.length)
  expect(ids(buildCatalog(html))).toEqual(a)
})

test('cambiar un texto cambia solo el ID de ese texto', () => {
  const t = cat.sections.find(s => s.id === 'p-pivm').texts.find(t => t.es.startsWith('Parque industrial en el epicentro'))
  const changed = buildCatalog(html.replace(t.es, t.es + ' Nuevo.'))
  const before = ids(cat); const after = ids(changed)
  const gone = before.filter(id => !after.includes(id))
  // el texto (par es/en) y el bloque .prose que lo contiene
  expect(gone).toHaveLength(2)
  expect(gone).toContain(t.id)
  expect(gone.every(id => id.startsWith('p-pivm:'))).toBe(true)
})
