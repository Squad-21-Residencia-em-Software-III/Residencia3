import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';
import { Drawer } from './Drawer';
import { Modal } from './Modal';

// SCRUM-306: diálogos com foco controlado, Escape só no de cima e retorno do foco (WCAG 2.4.3 e 2.1.2).

function ComModal({ aoFechar = vi.fn() }: { aoFechar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Abrir formulário
      </button>
      <Modal
        isOpen={aberto}
        title="Nova solicitação"
        onClose={() => {
          aoFechar();
          setAberto(false);
        }}
      >
        <label>
          Destino
          <input />
        </label>
        <button type="button">Salvar</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('renderiza fora de regiões transformadas e isola a aplicação', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div style={{ transform: 'translateY(0)', overflow: 'hidden' }}>
        <ComModal />
      </div>,
    );
    const abrir = screen.getByRole('button', { name: 'Abrir formulário' });
    await user.click(abrir);
    const dialogo = screen.getByRole('dialog', { name: 'Nova solicitação' });

    expect(container).not.toContainElement(dialogo);
    expect(dialogo.parentElement?.parentElement).toBe(document.body);
    expect(container).toHaveAttribute('inert');
    expect(container).toHaveAttribute('aria-hidden', 'true');
    await user.keyboard('{Escape}');
    expect(container).not.toHaveAttribute('inert');
    expect(container).not.toHaveAttribute('aria-hidden');
    expect(abrir).toHaveFocus();
  });

  it('mantém a confirmação acima do drawer e só restaura a rolagem após fechar os dois', async () => {
    const user = userEvent.setup();
    function PainelComConfirmacao() {
      const [painel, setPainel] = useState(false);
      const [confirmacao, setConfirmacao] = useState(false);
      return (
        <>
          <button type="button" onClick={() => { setPainel(true); setConfirmacao(true); }}>
            Abrir painel com confirmação
          </button>
          <Drawer isOpen={painel} title="Painel lateral" onClose={() => setPainel(false)}>
            <button type="button">Ação do painel</button>
            <ConfirmDialog isOpen={confirmacao} title="Confirmar remoção" description="Deseja remover?"
              onClose={() => setConfirmacao(false)} onConfirm={vi.fn()} />
          </Drawer>
        </>
      );
    }
    const html = document.documentElement.style;
    const body = document.body.style;
    html.setProperty('overflow-y', 'scroll', 'important');
    body.setProperty('overflow-x', 'clip');
    try {
      render(<PainelComConfirmacao />);
      const abrir = screen.getByRole('button', { name: 'Abrir painel com confirmação' });
      await user.click(abrir);
      const confirmacao = await screen.findByRole('alertdialog', { name: 'Confirmar remoção' });
      const painel = screen.getByText('Painel lateral').closest('[role=dialog]');
      expect(Number(confirmacao.parentElement?.style.zIndex)).toBeGreaterThan(Number(painel?.parentElement?.style.zIndex));
      expect(painel?.closest('[inert]')).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
      expect(html.overflow).toBe('hidden');
      expect(body.overflow).toBe('hidden');

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Painel lateral' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ação do painel' })).toHaveFocus();
      expect(body.overflow).toBe('hidden');
      await user.keyboard('{Escape}');

      expect(html.overflowY).toBe('scroll');
      expect(html.getPropertyPriority('overflow-y')).toBe('important');
      expect(body.overflowX).toBe('clip');
      expect(abrir).toHaveFocus();
    } finally {
      html.removeProperty('overflow-y');
      body.removeProperty('overflow-x');
    }
  });

  it('é um diálogo nomeado pelo título e leva o foco ao primeiro campo, não ao botão de fechar', async () => {
    const user = userEvent.setup();
    render(<ComModal />);
    await user.click(screen.getByRole('button', { name: 'Abrir formulário' }));

    expect(screen.getByRole('dialog', { name: 'Nova solicitação' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('textbox', { name: 'Destino' })).toHaveFocus();
  });

  it('prende o Tab dentro do diálogo, nos dois sentidos', async () => {
    const user = userEvent.setup();
    render(<ComModal />);
    await user.click(screen.getByRole('button', { name: 'Abrir formulário' }));

    await user.tab();
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus();
  });

  it('Escape fecha e o foco volta para quem abriu', async () => {
    const user = userEvent.setup();
    const aoFechar = vi.fn();
    render(<ComModal aoFechar={aoFechar} />);
    const abrir = screen.getByRole('button', { name: 'Abrir formulário' });
    await user.click(abrir);
    await user.keyboard('{Escape}');

    expect(aoFechar).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it('com dois diálogos, Escape fecha só o de cima', async () => {
    const user = userEvent.setup();
    function Empilhados() {
      const [confirmar, setConfirmar] = useState(false);
      const [formulario, setFormulario] = useState(true);
      return (
        <>
          <Modal isOpen={formulario} title="Formulário" onClose={() => setFormulario(false)}>
            <button type="button" onClick={() => setConfirmar(true)}>
              Excluir
            </button>
          </Modal>
          <ConfirmDialog
            isOpen={confirmar}
            title="Excluir registro?"
            description="Esta ação não pode ser desfeita."
            onClose={() => setConfirmar(false)}
            onConfirm={vi.fn()}
          />
        </>
      );
    }
    render(<Empilhados />);
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(screen.getByRole('alertdialog', { name: 'Excluir registro?' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Formulário' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveFocus();
  });

  it('com o fechamento bloqueado (envio em andamento), Escape não fecha', async () => {
    const user = userEvent.setup();
    const aoFechar = vi.fn();
    render(
      <Modal isOpen title="Enviando" onClose={aoFechar} bloquearFechamento>
        <p>Aguarde</p>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('se quem abriu sumiu, o foco vai para o conteúdo principal', async () => {
    const user = userEvent.setup();
    function LinhaRemovida() {
      const [linha, setLinha] = useState(true);
      const [aberto, setAberto] = useState(false);
      return (
        <main id="conteudo" tabIndex={-1}>
          {linha && (
            <button type="button" onClick={() => setAberto(true)}>
              Remover linha
            </button>
          )}
          <Modal
            isOpen={aberto}
            title="Remover"
            onClose={() => {
              setLinha(false);
              setAberto(false);
            }}
          >
            <button type="button">Ok</button>
          </Modal>
        </main>
      );
    }
    render(<LinhaRemovida />);
    await user.click(screen.getByRole('button', { name: 'Remover linha' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('ao fechar um diálogo aberto por navegação, dá foco ao conteúdo da nova rota', async () => {
    const teclado = userEvent.setup();
    function RotaComDialogo() {
      const [aberto, setAberto] = useState(true);
      return (
        <main id="conteudo" tabIndex={-1}>
          <Modal title="Agendar viagem" isOpen={aberto} onClose={() => setAberto(false)}>
            <button type="button">Agendar</button>
          </Modal>
        </main>
      );
    }
    render(<RotaComDialogo />);
    expect(screen.getByRole('button', { name: 'Agendar' })).toHaveFocus();
    await teclado.keyboard('{Escape}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});

describe('ConfirmDialog', () => {
  it('em ação perigosa, é alertdialog descrito pelo texto e começa em Cancelar', () => {
    render(
      <ConfirmDialog
        isOpen
        title="Cancelar viagem?"
        description="O motorista será avisado."
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        confirmLabel="Cancelar viagem"
        cancelLabel="Voltar"
      />,
    );
    const dialogo = screen.getByRole('alertdialog', { name: 'Cancelar viagem?' });
    expect(dialogo).toHaveAccessibleDescription('O motorista será avisado.');
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveFocus();
  });

  it('confirmação comum continua como dialog', () => {
    render(
      <ConfirmDialog isOpen variant="primary" title="Aprovar?" description="Confirma?" onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('dialog', { name: 'Aprovar?' })).toBeInTheDocument();
  });

  it('preserva a confirmação aberta enquanto processa', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfirmDialog isOpen isLoading title="Remover?" description="Aguarde."
      onClose={onClose} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Processando...' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Drawer', () => {
  function ComDrawer() {
    const [aberto, setAberto] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setAberto(true)}>
          Ver detalhes
        </button>
        <Drawer isOpen={aberto} onClose={() => setAberto(false)} title="Viagem 12" subtitle="Agendada para hoje">
          <a href="/viagens/12">Abrir viagem</a>
        </Drawer>
      </>
    );
  }

  it('é nomeado pelo título, descrito pelo subtítulo, prende o foco e devolve ao fechar', async () => {
    const user = userEvent.setup();
    render(<ComDrawer />);
    const abrir = screen.getByRole('button', { name: 'Ver detalhes' });
    await user.click(abrir);

    const painel = await screen.findByRole('dialog', { name: 'Viagem 12' });
    expect(painel).toHaveAccessibleDescription('Agendada para hoje');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Abrir viagem' })).toHaveFocus());

    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar painel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Abrir viagem' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(abrir).toHaveFocus();
  });
});
