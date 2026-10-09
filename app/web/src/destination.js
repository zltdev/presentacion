// A dónde va el usuario después del login.
// choice: 'presentar' | 'admin'. next: ruta a la que quería ir antes del login (solo rutas internas).
export function destination (role, choice, next) {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  if (choice === 'presentar' && role !== 'editor') return '/'
  return '/admin' // el editor no presenta: siempre al backoffice
}
