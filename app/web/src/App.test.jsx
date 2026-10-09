import { test, expect } from 'vitest'
import { destination } from './destination.js'

test('destino después del login según rol y elección', () => {
  expect(destination('presenter', 'presentar')).toBe('/')
  expect(destination('presenter', 'admin')).toBe('/admin')
  expect(destination('admin', 'presentar')).toBe('/')
  expect(destination('editor', 'presentar')).toBe('/admin') // el editor no presenta
  expect(destination('editor', 'admin')).toBe('/admin')
})

test('respeta la ruta pedida antes del login, solo si es interna', () => {
  expect(destination('presenter', 'admin', '/p/3')).toBe('/p/3')
  expect(destination('presenter', 'presentar', '//evil.com')).toBe('/')
  expect(destination('presenter', 'presentar', 'https://evil.com')).toBe('/')
})
