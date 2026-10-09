// Alta o cambio de clave de un usuario: node src/create-user.js <email> <nombre> <admin|presenter|editor>
// Genera una clave al azar y la muestra una sola vez.
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from './auth.js'
import { migrate } from './db/migrate.js'

const [email, name, role] = process.argv.slice(2)
if (!email || !name || !['admin', 'presenter', 'editor'].includes(role)) {
  console.error('uso: node src/create-user.js <email> <nombre> <admin|presenter|editor>')
  process.exit(1)
}
await migrate()
const password = randomBytes(12).toString('base64url')
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
await db.query(
  `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
  [email.toLowerCase(), name, role, await hashPassword(password)])
await db.end()
console.log(`${email.toLowerCase()} (${role}) — clave: ${password}`)
