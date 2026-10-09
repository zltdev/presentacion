import { createHash, randomBytes } from 'node:crypto'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

export const COOKIE = 'zlt_session'
const SESSION_DAYS = 7
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

export const hashPassword = pw => argonHash(pw) // argon2id por defecto
const sha = s => createHash('sha256').update(s).digest('hex')

// ponytail: intentos fallidos en memoria de un solo proceso; pasar a la DB si se escala a varios procesos
const fails = new Map()
function locked (key) {
  const f = fails.get(key)
  if (f && f.until > Date.now()) return true
  if (f && f.until && f.until <= Date.now()) fails.delete(key)
  return false
}
function fail (key) {
  const f = fails.get(key) || { n: 0, until: 0 }
  f.n++
  if (f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS
  fails.set(key, f)
}

// Devuelve { user, token } | { error: 'locked' | 'invalid' }
export async function login (db, email, password) {
  const key = String(email || '').trim().toLowerCase()
  if (locked(key)) return { error: 'locked' }
  const { rows: [u] } = await db.query('SELECT id, email, name, role, password_hash FROM users WHERE email = $1', [key])
  if (!u || !(await argonVerify(u.password_hash, String(password || '')))) {
    fail(key)
    return { error: locked(key) ? 'locked' : 'invalid' }
  }
  fails.delete(key)
  const token = randomBytes(32).toString('base64url')
  await db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))",
    [sha(token), u.id, SESSION_DAYS])
  return { user: { id: u.id, email: u.email, name: u.name, role: u.role }, token }
}

export async function userForToken (db, token) {
  if (!token) return null
  const { rows: [u] } = await db.query(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`, [sha(token)])
  return u || null
}

export const logout = (db, token) => token && db.query('DELETE FROM sessions WHERE id = $1', [sha(token)])

export const cookieOptions = secure => ({ path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: SESSION_DAYS * 86400 })

// preHandler: 403 si el usuario no tiene alguno de los roles
export const requireRole = (...roles) => async (req, reply) => {
  if (!roles.includes(req.user?.role)) return reply.code(403).send({ error: 'forbidden' })
}
