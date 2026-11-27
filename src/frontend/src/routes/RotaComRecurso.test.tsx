import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recursoAtivo } from '../config/recursosBackend'
import { RotaComRecurso } from './guards'

vi.mock('../config/recursosBackend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/recursosBackend')>()),
  recursoAtivo: vi.fn(),
}))

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/acompanhar']}>
      <Routes>
        <Route element={<RotaComRecurso recurso="solicitacaoExterna" />}>
          <Route path="/acompanhar" element={<p>página pública</p>} />
        </Route>
        <Route path="/404" element={<p>não encontrada</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RotaComRecurso', () => {
  beforeEach(() => vi.clearAllMocks())

  it('com a flag ligada, mostra a página', () => {
    vi.mocked(recursoAtivo).mockReturnValue(true)
    renderizar()
    expect(screen.getByText('página pública')).toBeInTheDocument()
  })

  it('com a flag desligada, vai para a 404', () => {
    vi.mocked(recursoAtivo).mockReturnValue(false)
    renderizar()
    expect(screen.getByText('não encontrada')).toBeInTheDocument()
    expect(screen.queryByText('página pública')).not.toBeInTheDocument()
  })
})
