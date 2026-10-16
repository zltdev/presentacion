import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFString, rgb } from 'pdf-lib'
import sharp from 'sharp'
import { indexDocument, loadHtml } from './catalog.js'
import { renderPresentation } from './render.js'

// PDF tipo dossier de una presentación, dibujado directo con pdf-lib (sin navegador).
// Reglas de formato (guía de comunicación): 1920 x 1080 pt, solo el idioma de la presentación,
// links absolutos y vivos, eyebrow arriba a la izquierda, estado de obra arriba a la derecha,
// logo del proyecto (sin título si hay logo), datos clave centrados, "Desarrolla" y "Acompañan"
// abajo con los logos en gris de marca, 2 fotos con ancho compartido y altura proporcional.
export const W = 1920
export const H = 1080
const M = 104
const SITE = 'https://proyectos.somoszlt.com/'

const hex = h => rgb(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255))
const C = {
  ink: '#323232', light: '#F4F2EC', soft: '#EDEAE1', txL: '#1A1A17', txD: '#ECE9E1',
  muted: '#8A8578', accent: '#72838d', func: '#5FA06B', opp: '#3E86AC', gray: '#3A3A3A'
}

const require = createRequire(import.meta.url)
const fontFile = w => readFileSync(require.resolve(`@fontsource/urbanist/files/urbanist-latin-${w}-normal.woff`))
const REPLACE = { '→': '-', '•': '·', ' ': ' ', '’': "'", '“': '"', '”': '"' }
const clean = s => (s ?? '').replace(/\s+/g, ' ').trim()
const absolute = href => new URL(href, SITE).href
const bytesOf = uri => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')

sharp.cache(false)
sharp.concurrency(1) // una imagen por vez: la memoria del contenedor es chica

// ---------- imágenes ----------
async function photo (uri) {
  const { data, info } = await sharp(bytesOf(uri)).rotate().resize({ width: 1500, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}
const pixels = async uri => { const m = await sharp(bytesOf(uri)).metadata(); return m.width * m.height }

// Logo como PNG: tal cual o teñido de un solo color (conserva la forma por el alpha).
async function logo (uri, { tint, maxW = 600 } = {}) {
  const img = sharp(bytesOf(uri)).resize({ width: maxW, withoutEnlargement: true })
  if (!tint) { const { data, info } = await img.png().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height } }
  const { data: raw, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const meta = await sharp(bytesOf(uri)).metadata()
  const [r, g, b] = [1, 3, 5].map(i => parseInt(tint.slice(i, i + 2), 16))
  for (let i = 0; i < raw.length; i += 4) {
    // sin canal alfa (fondo blanco): lo oscuro pasa a ser lo opaco
    if (!meta.hasAlpha) raw[i + 3] = 255 - Math.round((raw[i] + raw[i + 1] + raw[i + 2]) / 3)
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b
  }
  const data = await sharp(raw, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  return { data, w: info.width, h: info.height }
}

// ---------- extracción del HTML renderizado ----------
function extract ($, sec, lang, photoPick) {
  const s = $(sec)
  const L = lang === 'en' ? '.l-en' : '.l-es'
  const langText = el => clean($(el).find(L).first().text() || $(el).clone().children(`.l-es,.l-en`).remove().end().text())
  const all = sel => s.find(sel).toArray()
  const src = el => $(el).attr('src')

  // Etiqueta de cada link: lo que dice el botón sin la línea chica (<small>), o su aria-label
  const labelOf = (a, abs) => {
    const href = $(a).attr('href')
    if ($(a).hasClass('pvplay') || /youtu\.?be/.test(abs)) return lang === 'en' ? 'Watch video' : 'Ver video'
    if (href.startsWith('mailto:')) return href.slice(7)
    const own = $(a).find(L).first()
    const text = own.length ? own.text() : $(a).clone().find('small').remove().end().text()
    return clean(text) || $(a).attr('aria-label') || $(a).attr('title') || new URL(abs).hostname.replace(/^www\./, '')
  }
  const found = []
  for (const a of all('a[href]')) {
    const href = $(a).attr('href')
    if (!href || href.startsWith('#') || href.startsWith('javascript')) continue
    const abs = href.startsWith('mailto:') || href.startsWith('tel:') ? href : absolute(href)
    if (!found.some(l => l.uri === abs)) found.push({ uri: abs, label: labelOf(a, abs) })
  }
  // etiquetas repetidas: los brochures se distinguen por el nombre del archivo, el resto se numera
  const links = found.map(l => {
    const same = found.filter(o => o.label === l.label)
    if (same.length < 2) return l
    const stem = decodeURIComponent(l.uri.split('/').pop().replace(/\.pdf$/i, '')).replace(/[-_]+/g, ' ')
    return { ...l, label: /\.pdf$/i.test(l.uri) ? `${l.label} · ${stem}` : `${l.label} ${same.indexOf(found.find(o => o.uri === l.uri)) + 1}` }
  })
  const partners = new Map()
  for (const img of all('.acc-item img')) { // la cinta está duplicada para el scroll infinito
    const key = $(img).attr('alt') || src(img)
    if (!partners.has(key)) partners.set(key, { uri: src(img), lh: parseFloat(/--lh:([\d.]+)/.exec($(img).attr('style') || '')?.[1]) || 30, lw: parseFloat(/--lw:([\d.]+)/.exec($(img).attr('style') || '')?.[1]) || 80 })
  }
  const tag = s.find('.tag').first()
  return {
    id: $(sec).attr('id'),
    classes: $(sec).attr('class') || '',
    project: $(sec).attr('id').startsWith('p-'),
    eyebrow: langText(s.find('.eyebrow, .hero-eyebrow').first()),
    status: tag.length ? langText(tag) : '',
    statusKind: /tag-func/.test(tag.attr('class') || '') ? 'func' : /tag-opp/.test(tag.attr('class') || '') ? 'opp' : 'adv',
    title: clean(s.find('.pname').first().text()) || clean(s.find('h1 ' + L + ', h2 ' + L).toArray().slice(0, 2).map(el => $(el).text()).join(' ')),
    place: clean(s.find('.place').first().text()),
    logo: src(all('img.plogo')[0]),
    prose: all('.prose').map(langText).filter(Boolean),
    facts: all('.fact').map(f => ({ num: langText($(f).find('.fnum')), lab: langText($(f).find('.flab')) })),
    stages: all('.stage-group').map(g => ({ label: langText($(g).find('.stages-label')), chips: $(g).find('.stage-chip').toArray().map(c => clean($(c).text())) })),
    links,
    devLogo: src(all('img.acc-zlt')[0]),
    partners: [...partners.values()],
    photos: photoPick,
    // secciones que no son proyectos: todos los textos del idioma, en orden
    lines: all(L).filter(el => !$(el).closest('h1, h2, .eyebrow, .hero-eyebrow').length).map(el => clean($(el).text())).filter(t => t.length > 2 && !links.some(l => l.label === t))
  }
}

// ---------- dibujo ----------
class Slide {
  constructor (doc, fonts, report, bg, dark = false) {
    this.doc = doc; this.f = fonts; this.report = report; this.dark = dark
    this.page = doc.addPage([W, H])
    this.page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(bg) })
    this.n = doc.getPageCount()
    this.ink = dark ? C.txD : C.txL
  }

  safe (font, str) {
    font.chars ??= new Set(font.getCharacterSet())
    return [...str].map(c => font.chars.has(c.codePointAt(0)) ? c : (REPLACE[c] ?? '')).join('')
  }

  width (font, str, size, tracking = 0) { return font.widthOfTextAtSize(this.safe(font, str), size) + tracking * [...str].length }

  // top = borde superior de la caja de texto; align: 'left' | 'center' | 'right' respecto de x
  text (str, { x, top, font, size, color = this.ink, tracking = 0, align = 'left' }) {
    str = this.safe(font, str)
    const w = this.width(font, str, size, tracking)
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    const y = H - top - size * 0.8
    if (!tracking) this.page.drawText(str, { x: cx, y, font, size, color: hex(color) })
    else for (const ch of str) { this.page.drawText(ch, { x: cx, y, font, size, color: hex(color) }); cx += font.widthOfTextAtSize(ch, size) + tracking }
    return w
  }

  wrap (str, font, size, maxW) {
    const lines = []; let line = ''
    for (const word of this.safe(font, str).split(' ')) {
      const test = line ? `${line} ${word}` : word
      if (line && font.widthOfTextAtSize(test, size) > maxW) { lines.push(line); line = word } else line = test
    }
    return line ? [...lines, line] : lines
  }

  // devuelve el borde inferior del párrafo; maxBottom corta con "…"
  paragraph (str, { x, top, width, font, size, lh = 1.45, color, maxBottom = H }) {
    let y = top
    const lines = this.wrap(str, font, size, width)
    for (let i = 0; i < lines.length; i++) {
      if (y + size * lh > maxBottom) { this.text('…', { x, top: y, font, size, color }); return { bottom: y + size * lh, cut: true } }
      this.text(lines[i], { x, top: y, font, size, color })
      y += size * lh
    }
    return { bottom: y, cut: false }
  }

  rrect (x, top, w, h, r, opts) { this.page.drawSvgPath(`M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`, { x, y: H - top, ...opts }) }

  link (x, top, w, h, uri, label) {
    const annot = this.doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, H - top - h, x + w, H - top], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(uri) }
    })
    this.page.node.addAnnot(this.doc.context.register(annot))
    this.report.links.push({ page: this.n, uri, label, rect: [x, top, w, h] })
  }

  pill (str, { x, top, h = 56, font, size = 22, color, fill, border, uri, align = 'left', padX = 28 }) {
    const w = this.width(font, str, size) + padX * 2
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    this.rrect(px, top, w, h, h / 2, { color: fill ? hex(fill) : undefined, opacity: fill ? 0.14 : 0, borderColor: hex(border ?? color), borderWidth: 1.5, borderOpacity: 0.6 })
    this.text(str, { x: px + padX, top: top + (h - size) / 2 - 1, font, size, color })
    if (uri) this.link(px, top, w, h, uri, str)
    return { x: px, w }
  }

}

async function embedAll (doc, items) {
  for (const it of items) it.embedded = it.jpg ? await doc.embedJpg(it.data) : await doc.embedPng(it.data)
}

export async function buildPdf ({ baseHtml, presentation, photoIds = [] }) {
  const { name, lang = 'es' } = presentation
  const rendered = renderPresentation(baseHtml, presentation) // data: URIs adentro; se pasan a imágenes de a una
  const $ = loadHtml(rendered)
  const restore = s => $.restore(s)
  const report = { pages: 0, links: [], photos: [] }

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(name); doc.setAuthor('ZLT'); doc.setCreator('ZLT proyectos'); doc.setProducer('ZLT proyectos')
  const f = {
    reg: await doc.embedFont(fontFile(400), { subset: true }),
    semi: await doc.embedFont(fontFile(600), { subset: true }),
    bold: await doc.embedFont(fontFile(700), { subset: true }),
    xbold: await doc.embedFont(fontFile(800), { subset: true })
  }

  const header = /<a class="hlogo"[^>]*><img src="(data:[^"]+)"/.exec(baseHtml)?.[1]
  const brand = header ? await logo(header, { maxW: 800 }) : null
  if (brand) brand.embedded = await doc.embedPng(brand.data)

  const cover = (title, sub, uri, subLabel) => {
    const s = new Slide(doc, f, report, C.ink, true)
    if (brand) { const w = 360; s.page.drawImage(brand.embedded, { x: M, y: H - M - w * brand.h / brand.w, width: w, height: w * brand.h / brand.w }) }
    s.text(title, { x: M, top: 520, font: f.xbold, size: 96 })
    if (sub) s.text(sub, { x: M, top: 650, font: f.reg, size: 34, color: C.accent })
    if (uri) s.pill(subLabel, { x: M, top: 760, font: f.semi, color: C.txD, border: C.accent, uri })
  }

  cover(name, lang === 'en' ? 'Projects presentation' : 'Presentación de proyectos', SITE, 'proyectos.somoszlt.com')

  const index = indexDocument($)
  const picked = new Set(photoIds)
  for (const entry of index) {
    const photos = entry.elements.filter(e => e.type === 'foto').map(e => ({ id: e.id, uri: restore($(e.el).find('img').attr('src')) }))
    const d = extract($, entry.el, lang, photos)
    await slide(doc, f, report, d, picked, lang, restore)
  }

  cover(lang === 'en' ? 'Thank you' : 'Gracias', lang === 'en' ? 'Full website' : 'La web completa, con todos los proyectos', SITE, 'proyectos.somoszlt.com')

  report.pages = doc.getPageCount()
  return { bytes: await doc.save({ useObjectStreams: true }), report }
}

// 2 fotos: las marcadas en Administrar; si no hay marcadas, las de mayor resolución
async function pickPhotos (d, picked) {
  const marked = d.photos.filter(p => picked.has(p.id))
  const rest = d.photos.filter(p => !picked.has(p.id))
  const ranked = marked.length ? [] : await Promise.all(rest.map(async p => ({ p, px: await pixels(p.uri) })))
  const chosen = [...marked, ...ranked.sort((a, b) => b.px - a.px).map(r => r.p)].slice(0, 2)
  return Promise.all(chosen.map(async p => ({ id: p.id, jpg: true, ...(await photo(p.uri)) })))
}

async function slide (doc, f, report, d, picked, lang, restore) {
  const dark = !d.project && /\bdark\b|hero|contact/.test(d.classes + ' ' + d.id)
  const bg = dark ? C.ink : /soft|warm/.test(d.classes) ? C.soft : C.light
  const s = new Slide(doc, f, report, bg, dark)
  const muted = dark ? C.accent : C.muted
  const web = absolute(`#${d.id}`)

  // franja superior: eyebrow a la izquierda, estado de obra a la derecha, misma altura
  const topY = 84
  if (d.eyebrow) s.text(d.eyebrow.toUpperCase(), { x: M, top: topY + 14, font: f.bold, size: 22, color: C.accent, tracking: 5 })
  if (d.status) {
    const k = { func: C.func, opp: C.opp, adv: C.accent }[d.statusKind]
    s.pill(d.status, { x: W - M, top: topY, align: 'right', font: f.bold, size: 22, color: k, fill: k, h: 52 })
  }

  // fotos (ancho compartido, altura proporcional) y logo en la columna derecha
  const colX = 940, colW = W - M - colX
  const photos = await pickPhotos(d, picked)
  await embedAll(doc, photos)
  let right = 190
  if (d.logo) {
    const lg = await logo(restore(d.logo), { maxW: 700 })
    lg.embedded = await doc.embedPng(lg.data)
    const lw = Math.min(colW * 0.7, 460, 130 * lg.w / lg.h), lh = lw * lg.h / lg.w
    s.page.drawImage(lg.embedded, { x: W - M - lw, y: H - right - lh, width: lw, height: lh })
    right += lh + 36
  }
  if (photos.length) {
    const bottom = d.project ? 900 : 960
    const gap = 24
    const avail = bottom - right
    const ars = photos.map(p => p.h / p.w) // alto / ancho reales
    // A) apiladas con el mismo ancho; B) en fila con el mismo alto. Se usa la de mayor área.
    const wA = Math.min(colW, (avail - gap * (photos.length - 1)) / ars.reduce((a, r) => a + r, 0))
    const hB = Math.min(avail, (colW - gap * (photos.length - 1)) / ars.reduce((a, r) => a + 1 / r, 0))
    const areaA = ars.reduce((a, r) => a + wA * wA * r, 0), areaB = ars.reduce((a, r) => a + (hB / r) * hB, 0)
    const place = (p, x, top, w, h) => {
      s.page.drawImage(p.embedded, { x, y: H - top - h, width: w, height: h })
      report.photos.push({ page: s.n, id: p.id, source: p.w / p.h, placed: w / h })
    }
    if (areaA >= areaB) {
      let y = right
      photos.forEach((p, i) => { const h = wA * ars[i]; place(p, W - M - wA, y, wA, h); y += h + gap })
    } else {
      const widths = photos.map((_, i) => hB / ars[i])
      let x = W - M - widths.reduce((a, w) => a + w, 0) - gap * (photos.length - 1)
      photos.forEach((p, i) => { place(p, x, right, widths[i], hB); x += widths[i] + gap })
    }
  }

  // columna izquierda
  const leftW = photos.length || d.logo ? colX - M - 80 : 1280
  let y = 190
  if (d.title && !d.logo) {
    const size = d.project ? 76 : 60
    for (const l of s.wrap(d.title, f.xbold, size, leftW)) { s.text(l, { x: M, top: y, font: f.xbold, size }); y += size * 1.15 }
    y += 20
  }
  if (d.place) { s.text(d.place, { x: M, top: y, font: f.semi, size: 28, color: muted }); y += 58 }
  const body = d.project ? d.prose : d.lines.filter(l => l !== d.title && l !== d.eyebrow)
  const stagesH = d.project ? d.stages.length * 112 : 0
  const limit = d.project ? (d.facts.length ? 590 : 770) - stagesH : 880
  // listas cortas (equipo, sectores, pilares): dos columnas en lugar de un párrafo
  const asList = !d.project && body.length > 6 && body.every(l => l.length < 90)
  if (asList) {
    const rows = Math.ceil(body.length / 2), colW2 = (W - 2 * M - 80) / 2
    const size = Math.max(20, Math.min(30, (limit - y) / (rows * 1.75)))
    body.forEach((line, i) => {
      const col = Math.floor(i / rows)
      s.text('·  ' + line, { x: M + col * (colW2 + 80), top: y + (i % rows) * size * 1.75, font: f.semi, size })
    })
    y = limit
  }
  let cut = false
  const y0 = y
  // letra que se achica hasta que entra; si no entra ni a 20 pt, corta con "…" y suma el link a la web
  const sizes = asList ? [] : d.project ? [30, 28, 26, 24, 22] : [26, 24, 22, 20]
  for (const size of sizes) {
    const dry = body.reduce((acc, para) => acc + s.wrap(para, f.reg, size, leftW).length * size * 1.5 + 14, y0)
    if (dry <= limit + 40 || size === sizes.at(-1)) {
      y = y0
      for (const para of body) {
        if (y > limit) { cut = true; break }
        const r = s.paragraph(para, { x: M, top: y, width: leftW, font: d.project || para.length > 60 ? f.reg : f.semi, size, lh: 1.5, maxBottom: limit + 40 })
        y = r.bottom + 14
        cut ||= r.cut
      }
      break
    }
  }

  if (d.project) {
    for (const g of d.stages) {
      s.text(g.label.toUpperCase(), { x: M, top: y + 6, font: f.xbold, size: 16, color: muted, tracking: 3 })
      let cx = M; let cy = y + 38
      for (const chip of g.chips) {
        const w = s.width(f.semi, chip, 20) + 44
        if (cx + w > M + leftW) { cx = M; cy += 62 }
        s.rrect(cx, cy, w, 48, 24, { color: hex(C.accent), opacity: 0.1, borderColor: hex(C.accent), borderWidth: 1.2, borderOpacity: 0.5 })
        s.text(chip, { x: cx + 22, top: cy + 12, font: f.semi, size: 20, color: C.txL })
        cx += w + 12
      }
      y = cy + 74
    }
    // datos clave, centrados en la columna izquierda
    if (d.facts.length) {
      const fw = leftW / Math.max(d.facts.length, 3)
      const x0 = M + (leftW - fw * d.facts.length) / 2
      d.facts.forEach((fact, i) => {
        const fit = (font, str, size) => Math.min(size, size * (fw - 28) / s.width(font, str, size))
        const top = Math.max(y + 10, 650), cx = x0 + fw * i + fw / 2
        s.text(fact.num, { x: cx, top, font: f.xbold, size: fit(f.xbold, fact.num, 64), color: C.accent, align: 'center' })
        s.text(fact.lab, { x: cx, top: top + 80, font: f.semi, size: fit(f.semi, fact.lab, 20), color: muted, align: 'center' })
      })
    }
  }

  // botones con link (video, brochure, sitio): siempre sobre su propia etiqueta
  const buttons = d.links.slice(0, 4)
  if (cut || !buttons.length) buttons.push({ uri: web, label: lang === 'en' ? 'More on the web' : 'Seguir en la web' })
  let bx = M
  const by = d.project ? 828 : 940
  for (const b of buttons) {
    const p = s.pill(b.label, { x: bx, top: by, font: f.bold, size: 22, color: dark ? C.txD : C.txL, border: C.accent, uri: b.uri })
    bx += p.w + 16
    if (bx > M + leftW) break
  }

  if (d.project) await credits(doc, f, s, d, restore)
}

// "Desarrolla" (logo de ZLT) a la izquierda y "Acompañan" centrado sobre su fila de logos
async function credits (doc, f, s, d, restore) {
  const top = 950
  s.page.drawLine({ start: { x: M, y: H - top + 28 }, end: { x: W - M, y: H - top + 28 }, thickness: 1, color: hex('#1A1A17'), opacity: 0.12 })
  if (d.devLogo) {
    s.text('DESARROLLA', { x: M, top: top + 16, font: f.xbold, size: 15, color: C.muted, tracking: 3 })
    const lg = await logo(restore(d.devLogo), { tint: C.gray, maxW: 400 })
    lg.embedded = await doc.embedPng(lg.data)
    const h = 36, w = h * lg.w / lg.h
    s.page.drawImage(lg.embedded, { x: M + 190, y: H - top - 8 - h, width: w, height: h })
  }
  if (!d.partners.length) return
  const logos = []
  for (const p of d.partners) { const lg = await logo(restore(p.uri), { tint: C.gray, maxW: 360 }); lg.embedded = await doc.embedPng(lg.data); logos.push({ lg, p }) }
  const scale = 1.7, gap = 64
  let total = logos.reduce((a, { p }) => a + p.lw * scale, 0) + gap * (logos.length - 1)
  const k = Math.min(1, 1000 / total)
  total *= k
  const cx = 1330
  s.text('ACOMPAÑAN', { x: cx, top: top + 4, font: f.xbold, size: 15, color: C.muted, tracking: 3, align: 'center' })
  let x = cx - total / 2
  for (const { lg, p } of logos) {
    const w = p.lw * scale * k, h = p.lh * scale * k
    s.page.drawImage(lg.embedded, { x, y: H - top - 36 - h / 2 - 18, width: w, height: h })
    x += w + gap * k
  }
}
