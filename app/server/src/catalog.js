import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'

// Elementos que se pueden ocultar dentro de una sección. La clave es el "tipo" que va en el ID.
const BLOCKS = {
  video: '.pvideo',
  foto: '.gslide',
  texto: '.prose',
  partners: '.accompany',
  etapas: '.stages',
  brochure: 'a[href*="brochures/"]'
}

export const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10)

// ID estable = sección + tipo + hash del contenido. Si el mismo contenido se repite en la
// sección, se le agrega -2, -3... en orden de aparición.
function stableIds (sid, type, items, key) {
  const seen = new Map()
  return items.map(el => {
    const h = hash(key(el))
    const n = (seen.get(h) || 0) + 1
    seen.set(h, n)
    return { id: `${sid}:${type}:${h}${n > 1 ? '-' + n : ''}`, el }
  })
}

const BLOCK_KEY = {
  video: ($, el) => $(el).find('a').attr('href') || $(el).html(),
  foto: ($, el) => $(el).find('img').attr('src') || $(el).html(),
  brochure: ($, el) => $(el).attr('href'),
  default: ($, el) => $(el).text().replace(/\s+/g, ' ').trim()
}

// Recorre el documento y devuelve cada elemento con su ID y su nodo. Lo usan el catálogo
// y el render (PJW-007), así los IDs se calculan siempre igual.
export function indexDocument ($) {
  return $('section[id]').toArray().map(sec => {
    const sid = $(sec).attr('id')
    const elements = []
    for (const [type, sel] of Object.entries(BLOCKS)) {
      const key = BLOCK_KEY[type] || BLOCK_KEY.default
      elements.push(...stableIds(sid, type, $(sec).find(sel).toArray(), el => key($, el)).map(e => ({ ...e, type })))
    }
    // Textos editables (PJW-009): cada par español/inglés
    const pairs = $(sec).find('.l-es').toArray().filter(el => $(el).next('.l-en').length)
    const texts = stableIds(sid, 'txt', pairs, el => $(el).text() + '\u0000' + $(el).next('.l-en').text())
    return { id: sid, el: sec, elements, texts }
  })
}

function sectionTitle ($, sec) {
  const t = $(sec).find('.pname').first().text().trim() ||
    $(sec).find('img.plogo').attr('alt') ||
    $(sec).find('h1 .l-es, h2 .l-es').first().text().trim()
  return t || $(sec).attr('id')
}

// Catálogo serializable para el admin: secciones, elementos ocultables y textos.
export function buildCatalog (html) {
  const $ = cheerio.load(html)
  const sections = indexDocument($).map(s => {
    const counts = {}
    return {
      id: s.id,
      title: sectionTitle($, s.el),
      project: s.id.startsWith('p-'),
      elements: s.elements.map(({ id, type, el }) => {
        counts[type] = (counts[type] || 0) + 1
        const label = type === 'video'
          ? $(el).find('a').attr('href')
          : type === 'brochure' ? $(el).attr('href') : `${type} ${counts[type]}`
        return { id, type, label }
      }),
      texts: s.texts.map(({ id, el }) => ({ id, es: $(el).text(), en: $(el).next('.l-en').text() }))
    }
  })
  return { hash: hash(html), sections }
}

export async function loadCatalog (path) {
  return buildCatalog(await readFile(path, 'utf8'))
}
