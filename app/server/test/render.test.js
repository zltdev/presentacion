import { test, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import * as cheerio from 'cheerio'
import { buildCatalog } from '../src/catalog.js'
import { renderPresentation } from '../src/render.js'

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8')
let cat, pivm, out, $
const prose = () => pivm.texts.find(t => t.es.startsWith('Parque industrial en el epicentro'))

beforeAll(() => {
  cat = buildCatalog(html)
  pivm = cat.sections.find(s => s.id === 'p-pivm')
  const fotos = pivm.elements.filter(e => e.type === 'foto')
  out = renderPresentation(html, {
    sections: ['p-plazasusa', 'hero', 'p-pivm'],
    hidden: [fotos[1].id, fotos[4].id, fotos[7].id, pivm.elements.find(e => e.type === 'video').id],
    lang: 'en',
    overrides: { [prose().id]: { en: 'Edited English text.' } }
  })
  $ = cheerio.load(out)
})

test('una galería con 3 de 11 fotos ocultas muestra "1 / 8" y 8 puntos', () => {
  const g = $('#p-pivm [data-gallery]')
  expect(g.find('.gslide')).toHaveLength(8)
  expect(g.find('.gdot')).toHaveLength(8)
  expect(g.find('.gcount').text()).toBe('1 / 8')
})

test('no incluye gate.js ni las secciones ocultas, y respeta el orden', () => {
  expect(out).not.toContain('/gate.js')
  expect($('section[id]').toArray().map(s => $(s).attr('id'))).toEqual(['p-plazasusa', 'hero', 'p-pivm'])
  expect($('#p-pivm .pvideo')).toHaveLength(0)
  expect($('#hdr a[href="#p-alamos"], .mov a[href="#p-alamos"]')).toHaveLength(0)
})

test('aplica el override y no muestra el texto original', () => {
  expect($('#p-pivm .prose .l-en').text()).toBe('Edited English text.')
  expect(out).not.toContain(prose().en)
  expect($('#p-pivm .prose .l-es').text()).toBe(prose().es) // el otro idioma queda igual
})

test('idioma fijo y brochures con ruta absoluta', () => {
  expect($('body').hasClass('en')).toBe(true)
  expect($('a[href^="brochures/"]')).toHaveLength(0)
  expect($('#p-pivm a[href="/brochures/parque-industrial-vaca-muerta.pdf"]')).toHaveLength(1)
})

test('presentación de ejemplo (resumen estructural)', () => {
  const resumen = $('section[id]').toArray().map(s => ({
    id: $(s).attr('id'),
    fotos: $(s).find('.gslide').length,
    contador: $(s).find('.gcount').text()
  }))
  expect({ resumen, menu: $('#hdr a[href^="#"]').toArray().map(a => $(a).attr('href')) }).toMatchSnapshot()
})

test('"Web completa" (sin secciones elegidas) conserva todo salvo el gate', () => {
  const full = cheerio.load(renderPresentation(html, { sections: [], hidden: [], lang: 'es' }))
  expect(full('section[id]')).toHaveLength(27)
  expect(full('.gslide')).toHaveLength(cheerio.load(html)('.gslide').length)
  expect(full('script[src="/gate.js"]')).toHaveLength(0)
})
