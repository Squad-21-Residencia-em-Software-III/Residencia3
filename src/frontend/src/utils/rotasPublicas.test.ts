import { describe, expect, it } from 'vitest'
import { ehRotaPublicaAnonima } from './rotasPublicas'

describe('ehRotaPublicaAnonima', () => {
  it.each(['/acompanhar', '/acompanhar/', '/acompanhar/qualquer', '/solicitar-svo', '/solicitar-svo/confirmacao'])(
    'reconhece %s como página pública',
    (caminho) => {
      expect(ehRotaPublicaAnonima(caminho)).toBe(true)
    },
  )

  it.each(['/', '/login', '/inicio', '/acompanharx', '/solicitacoes', '/x/acompanhar'])(
    'não trata %s como página pública',
    (caminho) => {
      expect(ehRotaPublicaAnonima(caminho)).toBe(false)
    },
  )
})
