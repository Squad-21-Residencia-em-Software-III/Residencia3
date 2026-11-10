import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AuditoriaPage from './AuditoriaPage'
import { auditoriaApi } from '../services/api/auditoriaApi'
import { ApiError } from '../services/api/http'
import type { RegistroAuditoria } from '../types/auditoria'

vi.mock('../services/api/auditoriaApi', () => ({
  auditoriaApi: { listar: vi.fn() },
}))

const listar = vi.mocked(auditoriaApi.listar)

const registro = (id: number, extra: Partial<RegistroAuditoria> = {}): RegistroAuditoria => ({
  id,
  usuario_id: 1,
  acao: `ACAO_${id}`,
  modulo: 'VIAGENS',
  data_hora: '2026-11-08T12:00:00.000Z',
  ...extra,
})

describe('AuditoriaPage', () => {
  beforeEach(() => {
    listar.mockReset()
  })

  it('exibe os registros retornados pela API', async () => {
    listar.mockResolvedValue([
      registro(2, { acao: 'FINALIZOU_VIAGEM id=3', modulo: 'VIAGENS', usuario_id: 5 }),
      registro(1, { acao: 'LOGIN', modulo: 'MODULO_NOVO', usuario_id: null }),
    ])

    render(<AuditoriaPage />)

    expect(await screen.findByText('FINALIZOU_VIAGEM id=3')).toBeInTheDocument()
    expect(screen.getByText('Viagens')).toBeInTheDocument()
    expect(screen.getByText('Usuário #5')).toBeInTheDocument()
    // Módulo sem rótulo conhecido aparece como veio da API
    expect(screen.getByText('MODULO_NOVO')).toBeInTheDocument()
    expect(screen.getByText('Não identificado')).toBeInTheDocument()
  })

  it('informa quando não há registros', async () => {
    listar.mockResolvedValue([])

    render(<AuditoriaPage />)

    expect(await screen.findByText('Nenhum registro de auditoria encontrado.')).toBeInTheDocument()
  })

  it('não expõe dados quando o acesso é negado', async () => {
    listar.mockRejectedValue(new ApiError('Acesso negado', 403))

    render(<AuditoriaPage />)

    expect(
      await screen.findByText('Você não tem permissão para consultar os registros de auditoria.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ACAO_/)).not.toBeInTheDocument()
  })

  it('pagina a lista de 20 em 20', async () => {
    listar.mockResolvedValue(Array.from({ length: 25 }, (_, i) => registro(25 - i)))

    render(<AuditoriaPage />)

    expect(await screen.findByText('ACAO_25')).toBeInTheDocument()
    expect(screen.queryByText('ACAO_5')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))

    expect(screen.getByText('ACAO_5')).toBeInTheDocument()
    expect(screen.queryByText('ACAO_25')).not.toBeInTheDocument()
  })
})
