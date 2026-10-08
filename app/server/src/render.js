import * as cheerio from 'cheerio'
import { indexDocument } from './catalog.js'

// Arma el HTML de una presentación a partir de index.html sin tocar el archivo base.
// p = { sections: [ids en orden] (vacío = todas, "Web completa"), hidden: [ids de elementos],
//       lang: 'es'|'en', overrides: { [textId]: { es?, en? } } }
export function renderPresentation (html, p) {
  const $ = cheerio.load(html)
  const hidden = new Set(p.hidden || [])
  const index = indexDocument($)

  $('script[src="/gate.js"]').remove() // lo reemplaza el login real

  // Secciones: quitar las no elegidas y reordenar las elegidas
  const keep = p.sections?.length ? p.sections : index.map(s => s.id)
  const byId = new Map(index.map(s => [s.id, s]))
  const removed = index.filter(s => !keep.includes(s.id)).map(s => s.id)
  removed.forEach(id => $(byId.get(id).el).remove())
  const kept = keep.map(id => byId.get(id)).filter(Boolean)
  if (kept.length) {
    const anchor = $('<i data-zlt-anchor></i>').insertBefore(kept[0].el)
    kept.forEach(s => anchor.before($(s.el)))
    anchor.remove()
  }

  // Elementos ocultos y textos corregidos, solo en las secciones que quedan
  for (const s of kept) {
    for (const e of s.elements) if (hidden.has(e.id)) $(e.el).remove()
    for (const t of s.texts) {
      const o = p.overrides?.[t.id]
      if (o?.es != null) $(t.el).text(o.es)
      if (o?.en != null) $(t.el).next('.l-en').text(o.en)
    }
  }
  fixGalleries($)
  fixNav($, removed)

  // Links relativos a brochures: la presentación no se sirve desde la raíz
  $('a[href^="brochures/"]').each((_, a) => { $(a).attr('href', '/' + $(a).attr('href')) })

  if (p.lang === 'en') {
    $('body').addClass('en')
    $('html').attr('lang', 'en')
  }
  return $.html()
}

// El JS de la web cuenta las fotos solo, pero el total "/ N" y los puntos vienen fijos en el HTML
function fixGalleries ($) {
  $('[data-gallery]').each((_, g) => {
    const n = $(g).find('.gslide').length
    if (!n) return void $(g).remove()
    $(g).find('.gdot').each((i, d) => {
      if (i >= n) $(d).remove()
      else $(d).toggleClass('on', i === 0)
    })
    $(g).find('.gcount').html(`<span class="gc-cur">1</span> / ${n}`)
    if (n < 2) $(g).find('.garr, .gdots, .gcount').remove()
  })
}

// Menús: sacar links a secciones quitadas y los grupos que quedan vacíos.
// En el contenido (hero, tarjetas de sectores) se deja el elemento y se le quita el link.
function fixNav ($, removed) {
  for (const id of removed) {
    $(`#hdr a[href="#${id}"], .mov a[href="#${id}"]`).remove()
    $(`a[href="#${id}"]`).removeAttr('href')
  }
  $('.sector').filter((_, s) => !$(s).find('a').length).remove()
  $('.mi[data-menu]').filter((_, m) => !$(m).find('.panel a').length).remove()
}
