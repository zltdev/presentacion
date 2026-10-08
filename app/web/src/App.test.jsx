import { test, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import App from './App.jsx'

test('App renderiza el título', () => {
  expect(renderToString(<App />)).toContain('ZLT · Proyectos')
})
