import { test, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildCatalog } from '../src/catalog.js'
import { H, W, buildPdf } from '../src/pdf.js'

// Contra el index.html real, como el resto del admin
const baseHtml = readFileSync(fileURLToPath(new URL('../../../index.html', import.meta.url)), 'utf8')
const catalog = buildCatalog(baseHtml)
const SECTIONS = ['p-alamos', 'p-pivm', 'nosotros', 'contacto']
const fotos = id => catalog.sections.find(s => s.id === id).elements.filter(e => e.type === 'foto').map(e => e.id)
let out, doc

const read = async bytes => pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
const texts = async page => (await page.getTextContent()).items

beforeAll(async () => {
  out = await buildPdf({
    baseHtml,
    presentation: { name: 'Inversores', lang: 'es', sections: SECTIONS, hidden: [], overrides: {} },
    photoIds: fotos('p-alamos').slice(2, 4) // marcadas a mano: no son las 2 primeras
  })
  doc = await read(out.bytes)
}, 120000)

test('una página por sección más tapa y contratapa, de 1920 x 1080 pt, y liviano para mandar por mail', async () => {
  expect(doc.numPages).toBe(SECTIONS.length + 2)
  for (let n = 1; n <= doc.numPages; n++) {
    const [x0, y0, x1, y1] = (await doc.getPage(n)).view
    expect([x1 - x0, y1 - y0]).toEqual([W, H])
  }
  expect(out.bytes.length).toBeLessThan(5_000_000)
})

test('auditoría de enlaces: cada área clickeable cae sobre su propia etiqueta, con URL absoluta', async () => {
  let audited = 0
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const items = await texts(page)
    for (const a of (await page.getAnnotations()).filter(a => a.subtype === 'Link')) {
      const [x0, y0, x1, y1] = a.rect
      const under = items.filter(t => t.transform[4] >= x0 - 1 && t.transform[4] <= x1 && t.transform[5] >= y0 && t.transform[5] <= y1)
        .map(t => t.str).join('').replace(/\s+/g, '')
      const expected = out.report.links.find(l => l.page === n && l.uri === a.url)
      expect(expected, `link sin registro en p${n}: ${a.url}`).toBeTruthy()
      expect(under, `p${n} ${a.url}`).toBe(expected.label.replace(/\s+/g, ''))
      expect(a.url).toMatch(/^(https:\/\/|mailto:)/)
      audited++
    }
  }
  expect(audited).toBe(out.report.links.length)
  expect(audited).toBeGreaterThan(8)
})

test('ninguna foto se deforma, hay 2 por proyecto y se respetan las marcadas', () => {
  for (const p of out.report.photos) expect(Math.abs(p.placed / p.source - 1), p.id).toBeLessThan(0.01)
  const alamos = out.report.photos.filter(p => p.id.startsWith('p-alamos'))
  expect(alamos.map(p => p.id)).toEqual(fotos('p-alamos').slice(2, 4))
  expect(out.report.photos.filter(p => p.id.startsWith('p-pivm'))).toHaveLength(2) // automáticas
})

test('solo el idioma de la presentación, textos corregidos aplicados y fotos ocultas fuera', async () => {
  const sec = catalog.sections.find(s => s.id === 'nosotros')
  const t = sec.texts.find(x => x.es.length > 60) // un párrafo, no el título ni el eyebrow
  const ocultas = fotos('p-pivm')
  const r = await buildPdf({
    baseHtml,
    presentation: { name: 'EN', lang: 'en', sections: ['nosotros', 'p-pivm'], hidden: ocultas.slice(0, ocultas.length - 2), overrides: { [t.id]: { en: 'Corrected sentence for the test' } } }
  })
  const d = await read(r.bytes)
  const all = (await Promise.all([2, 3].map(async n => (await texts(await d.getPage(n))).map(x => x.str).join(' ')))).join(' ')
  expect(all).toContain('Corrected sentence for the test')
  expect(all).not.toContain(t.es.slice(0, 30))
  expect(r.report.photos.filter(p => p.id.startsWith('p-pivm')).map(p => p.id)).toEqual(ocultas.slice(-2)) // solo quedaron 2 visibles
})
