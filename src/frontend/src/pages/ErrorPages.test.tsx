
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import ForbiddenPage from './ForbiddenPage'
import NotFoundPage from './NotFoundPage'

describe('Páginas de erro', () => {
  it('exibe corretamente a tela de acesso não autorizado (403)', () => {
    render(
      <MemoryRouter initialEntries={['/403']}>
        <Routes>
          <Route path="/403" element={<ForbiddenPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Acesso não autorizado' })
    ).toBeInTheDocument()

    expect(
      screen.getByText(/Esta área é de acesso restrito/)
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: /Ir para o Início/i })
    ).toBeInTheDocument()
  })

  it('exibe corretamente a tela de página não encontrada (404)', () => {
    render(
      <MemoryRouter initialEntries={['/404']}>
        <Routes>
          <Route path="/404" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Página não encontrada' })
    ).toBeInTheDocument()

    expect(
      screen.getByText(/Esta página não está disponível/)
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: /Ir para o Início/i })
    ).toBeInTheDocument()
  })

  it('navega para o início ao clicar no botão principal da tela 403', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/403']}>
        <Routes>
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/inicio" element={<h1>Início carregado</h1>} />
        </Routes>
      </MemoryRouter>
    )

    await user.click(
      screen.getByRole('button', { name: /Ir para o Início/i })
    )

    expect(
      screen.getByRole('heading', { name: 'Início carregado' })
    ).toBeInTheDocument()
  })

  it('retorna à página anterior ao clicar em Voltar na tela 404', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter
        initialEntries={['/origem', '/404']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/origem" element={<h1>Página anterior</h1>} />
          <Route path="/404" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /Voltar/i }))

    expect(
      screen.getByRole('heading', { name: 'Página anterior' })
    ).toBeInTheDocument()
  })
})
