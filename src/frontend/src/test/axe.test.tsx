import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SecaoAcessibilidade } from '../components/acessibilidade/SecaoAcessibilidade';
import { AppLayout, type NavItem } from '../components/layout/AppLayout';
import { MotoristaLayout } from '../components/layout/MotoristaLayout';
import { Alert, Badge, Button, ConfirmDialog, Drawer, HomeIcon, Input, Modal, Select, Textarea } from '../components/ui';
import { AgendaSemana } from '../pages/agenda/AgendaSemana';
import LoginPage from '../pages/LoginPage';
import type { Viagem } from '../types/viagem';

// SCRUM-306: verificação automática com axe-core (WCAG 2.0, 2.1 e 2.2, níveis A e AA) das composições principais.
// Contraste fica de fora: o jsdom não calcula layout nem cores; é coberto por styles/paletas.test.ts e pela
// verificação manual registrada em docs/scrum-305-306-307-acessibilidade.md.

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ usuario: null, carregando: false, login: vi.fn() }),
}));

async function violacoes(elemento: ReactElement) {
  const { container } = render(elemento);
  const resultado = await axe.run(container.ownerDocument.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    rules: {
      'color-contrast': { enabled: false },
      // Componentes testados soltos, fora da página inteira
      region: { enabled: false },
      'landmark-one-main': { enabled: false },
      'page-has-heading-one': { enabled: false },
    },
  });
  return resultado.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const NAV: NavItem[] = [
  { path: '/inicio', label: 'Início', icon: HomeIcon, section: 'Visão Geral' },
  { path: '/viagens', label: 'Viagens', icon: HomeIcon, section: 'Operação', badge: 2, badgeTone: 'warning' },
];

describe('axe-core sem violações', () => {
  it('seção de acessibilidade', async () => {
    expect(await violacoes(<main><SecaoAcessibilidade /></main>)).toEqual([]);
  });

  it('modal com formulário, erro e alertas', async () => {
    expect(
      await violacoes(
        <Modal isOpen title="Nova solicitação" onClose={vi.fn()} onConfirm={vi.fn()}>
          <Input label="Origem" erro="Informe a origem." />
          <Select label="Veículo" descricao="Só veículos disponíveis.">
            <option value="">Selecione</option>
          </Select>
          <Textarea label="Finalidade" />
          <Alert tone="danger">Não foi possível salvar.</Alert>
          <Alert tone="info">Rascunho guardado.</Alert>
          <Badge tone="success">Aprovada</Badge>
        </Modal>,
      ),
    ).toEqual([]);
  });

  it('confirmação de ação perigosa', async () => {
    expect(
      await violacoes(
        <ConfirmDialog isOpen title="Excluir?" description="Não pode ser desfeito." onClose={vi.fn()} onConfirm={vi.fn()} />,
      ),
    ).toEqual([]);
  });

  it('painel lateral', async () => {
    expect(
      await violacoes(
        <Drawer isOpen onClose={vi.fn()} title="Viagem 12" subtitle="Agendada" footer={<Button>Iniciar</Button>}>
          <p>Detalhes</p>
        </Drawer>,
      ),
    ).toEqual([]);
  });

  it('layout interno', async () => {
    expect(
      await violacoes(
        <MemoryRouter initialEntries={['/inicio']}>
          <AppLayout navItems={NAV} title="Início" user={{ name: 'Ana Souza', role: 'Administrador' }}>
            <h2>Painel</h2>
          </AppLayout>
        </MemoryRouter>,
      ),
    ).toEqual([]);
  });

  it('layout do motorista', async () => {
    expect(
      await violacoes(
        <MemoryRouter initialEntries={['/inicio']}>
          <MotoristaLayout navItems={NAV} title="Início" user={{ name: 'João', role: 'Motorista' }} onLogout={vi.fn()}>
            <h2>Minhas viagens</h2>
          </MotoristaLayout>
        </MemoryRouter>,
      ),
    ).toEqual([]);
  });

  it('tela de entrada (área pública), com o acesso à acessibilidade', async () => {
    expect(
      await violacoes(
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>,
      ),
    ).toEqual([]);
  });

  it('agenda da semana com legenda', async () => {
    const viagem = { id: 1, status: 'AGENDADA', tipo_operacao: 'ADMINISTRATIVA', origem: 'Sede', destino: 'LACEN' } as unknown as Viagem;
    expect(
      await violacoes(
        <AgendaSemana
          linhas={[
            {
              id: 1,
              modelo: 'Spin',
              placa: 'ABC1D23',
              blocos: [
                {
                  chave: 'ADMINISTRATIVA-1',
                  data: '2026-11-30',
                  viagem,
                  inicioMin: 480,
                  fimMin: 600,
                  horaInicioLabel: '08:00',
                  horaFimLabel: '10:00',
                  semPrevisaoFim: false,
                },
              ],
            },
          ]}
          diasSemana={[{ data: '2026-11-30', label: 'Seg', diaNumero: 30, ehHoje: false }]}
          onSelecionarViagem={vi.fn()}
        />,
      ),
    ).toEqual([]);
  });
});
