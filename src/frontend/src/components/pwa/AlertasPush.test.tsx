import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { useVinculoPush } from '../../hooks/useVinculoPush';
import { ApiError } from '../../services/api/http';
import { notificacoesPushApi } from '../../services/api/notificacoesPushApi';
import { marcarEncerramento } from '../../utils/encerramentoPush';
import { invalidarOperacoesPush } from '../../utils/operacoesPush';
import { ModalPreferenciasPwa } from './ModalPreferenciasPwa';
import { instalarArmazenamentoPushTeste, criarTravasPushTeste, VINCULO_TESTE } from '../../sw/fixturesPush';

vi.mock('../../services/api/notificacoesPushApi', () => ({
  notificacoesPushApi: {
    chavePublica: vi.fn(),
    assinar: vi.fn(),
    cancelar: vi.fn(),
    situacao: vi.fn(),
    preferencias: vi.fn(),
    salvarPreferencia: vi.fn(),
  },
}));

const sessao = vi.hoisted(() => ({ id: 1 }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { id: sessao.id } }) }));

const api = vi.mocked(notificacoesPushApi);
const recursosOriginais = { ...RECURSOS_BACKEND };

interface AssinaturaFalsa {
  endpoint: string;
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
}

/** Navegador de mentira: guarda a permissão e a assinatura, como o `PushManager` faria. */
const navegador = {
  permissao: 'default' as NotificationPermission,
  resposta: 'granted' as NotificationPermission,
  assinatura: null as AssinaturaFalsa | null,
  pedirPermissao: vi.fn(),
  assinar: vi.fn(),
};

function novaAssinatura(endpoint: string): AssinaturaFalsa {
  const assinatura: AssinaturaFalsa = {
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' } }),
    unsubscribe: vi.fn(async () => {
      if (navegador.assinatura === assinatura) navegador.assinatura = null;
      return true;
    }),
  };
  return assinatura;
}

function definir(alvo: object, nome: string, valor: unknown) {
  Object.defineProperty(alvo, nome, { configurable: true, value: valor });
}

const travas: string[] = [];

function prepararNavegador() {
  travas.length = 0;
  instalarArmazenamentoPushTeste();
  definir(navigator, 'locks', criarTravasPushTeste((nome) => travas.push(nome)));
  navegador.permissao = 'default';
  navegador.resposta = 'granted';
  navegador.assinatura = null;
  navegador.pedirPermissao = vi.fn(async () => (navegador.permissao = navegador.resposta));
  navegador.assinar = vi.fn(async () => (navegador.assinatura = novaAssinatura('https://push.exemplo/novo')));
  const registro = {
    pushManager: { getSubscription: async () => navegador.assinatura, subscribe: navegador.assinar },
  };
  definir(window, 'Notification', {
    get permission() { return navegador.permissao; },
    requestPermission: () => navegador.pedirPermissao(),
  });
  definir(window, 'PushManager', class {});
  definir(navigator, 'serviceWorker', {
    ready: Promise.resolve(registro),
    getRegistration: async () => registro,
  });
  definir(navigator, 'onLine', true);
}

function semPush() {
  for (const nome of ['Notification', 'PushManager']) delete (window as unknown as Record<string, unknown>)[nome];
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
}

/** Aparelho já assinado e com a permissão concedida. */
function jaAssinado() {
  navegador.permissao = 'granted';
  return (navegador.assinatura = novaAssinatura('https://push.exemplo/atual'));
}

const tela = () => <ModalPreferenciasPwa isOpen onClose={vi.fn()} />;
const abrir = () => render(tela());
const ligar = () => screen.findByRole('button', { name: 'Ligar alertas' });
const desligar = () => screen.findByRole('button', { name: 'Desligar neste aparelho' });

beforeEach(() => {
  vi.clearAllMocks();
  invalidarOperacoesPush();
  sessao.id = 1;
  RECURSOS_BACKEND.webPush = true;
  prepararNavegador();
  api.chavePublica.mockResolvedValue({ publicKey: 'AQID_-8' });
  api.assinar.mockResolvedValue(undefined);
  api.cancelar.mockResolvedValue(undefined);
  api.situacao.mockResolvedValue({ ativa: true, vinculo: VINCULO_TESTE });
  api.preferencias.mockResolvedValue({
    categorias: [
      { codigo: 'VIAGENS', titulo: 'Viagens', descricao: 'Agendamento e mudanças.', push: true },
      { codigo: 'ODOMETRO', titulo: 'Odômetro', push: false },
    ],
  });
  api.salvarPreferencia.mockImplementation(async (codigo, push) => ({ codigo, titulo: codigo, push }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(RECURSOS_BACKEND, recursosOriginais);
  semPush();
  for (const nome of ['onLine', 'locks']) delete (navigator as unknown as Record<string, unknown>)[nome];
  localStorage.clear();
});

describe('Interruptor', () => {
  it('desligado, as preferências ficam como antes e a API de push não é chamada', () => {
    RECURSOS_BACKEND.webPush = false;
    abrir();
    expect(screen.queryByText('Alertas neste aparelho')).not.toBeInTheDocument();
    expect(screen.getByText('Notificações')).toBeInTheDocument();
    expect(api.preferencias).not.toHaveBeenCalled();
  });

  it('ligado, não repete o pedido antigo de notificações', async () => {
    abrir();
    await ligar();
    expect(screen.queryByText('Notificações')).not.toBeInTheDocument();
    expect(screen.getByText('Localização (GPS)')).toBeInTheDocument();
  });
});

describe('Ligar e desligar neste aparelho', () => {
  it('só pede a permissão depois do toque e registra a assinatura', async () => {
    abrir();
    const botao = await ligar();
    expect(navegador.pedirPermissao).not.toHaveBeenCalled();

    await userEvent.click(botao);
    expect(await desligar()).toBeInTheDocument();
    expect(navegador.pedirPermissao).toHaveBeenCalledOnce();
    expect(navegador.assinar).toHaveBeenCalledExactlyOnceWith({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from([1, 2, 3, 255, 239]),
    });
    expect(api.assinar).toHaveBeenCalledExactlyOnceWith(
      { endpoint: 'https://push.exemplo/novo', keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' } },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Ligados')).toBeInTheDocument();
  });

  it('pede a permissão no próprio toque, antes de qualquer consulta', async () => {
    abrir();
    const botao = await ligar();
    fireEvent.click(botao);
    expect(navegador.pedirPermissao).toHaveBeenCalledOnce();
    expect(api.chavePublica).not.toHaveBeenCalled();
    await desligar();
  });

  it('toque duplo não assina duas vezes', async () => {
    abrir();
    const botao = await ligar();
    fireEvent.click(botao);
    fireEvent.click(botao);
    await desligar();
    expect(navegador.pedirPermissao).toHaveBeenCalledOnce();
    expect(api.assinar).toHaveBeenCalledOnce();
  });

  it('negada, explica como permitir e não pede de novo', async () => {
    navegador.resposta = 'denied';
    abrir();
    await userEvent.click(await ligar());
    expect(await screen.findByText(/O navegador está bloqueando os alertas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ligar alertas' })).not.toBeInTheDocument();
    expect(navegador.assinar).not.toHaveBeenCalled();
    expect(navegador.pedirPermissao).toHaveBeenCalledOnce();
  });

  it('já bloqueada ao abrir, nem oferece o botão', async () => {
    navegador.permissao = 'denied';
    abrir();
    expect(await screen.findByText('Bloqueados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ligar alertas' })).not.toBeInTheDocument();
  });

  it('pedido fechado sem resposta: avisa e deixa tentar de novo', async () => {
    navegador.resposta = 'default';
    abrir();
    await userEvent.click(await ligar());
    expect(await screen.findByText(/pedido do navegador foi fechado/)).toBeInTheDocument();
    expect(api.chavePublica).not.toHaveBeenCalled();

    navegador.resposta = 'granted';
    await userEvent.click(await ligar());
    expect(await desligar()).toBeInTheDocument();
    expect(screen.queryByText(/pedido do navegador foi fechado/)).not.toBeInTheDocument();
  });

  it('se o servidor recusar (ex.: limite de aparelhos), desfaz no navegador e mostra o motivo', async () => {
    api.assinar.mockRejectedValueOnce(new ApiError('Você já tem 5 aparelhos com alertas.', 409));
    abrir();
    await userEvent.click(await ligar());
    expect(await screen.findByText('Você já tem 5 aparelhos com alertas.')).toBeInTheDocument();
    expect(navegador.assinatura).toBeNull();
    expect(screen.getByText('Desligados')).toBeInTheDocument();
  });

  it('se a chave pública falhar, não assina nada', async () => {
    api.chavePublica.mockRejectedValueOnce(new ApiError('Alertas indisponíveis.', 503));
    abrir();
    await userEvent.click(await ligar());
    expect(await screen.findByText('Alertas indisponíveis.')).toBeInTheDocument();
    expect(navegador.assinar).not.toHaveBeenCalled();
  });

  it('desliga no servidor e no navegador', async () => {
    const assinatura = jaAssinado();
    abrir();
    await userEvent.click(await desligar());
    expect(await ligar()).toBeInTheDocument();
    expect(api.cancelar).toHaveBeenCalledExactlyOnceWith(
      'https://push.exemplo/atual', { signal: expect.any(AbortSignal) },
    );
    expect(assinatura.unsubscribe).toHaveBeenCalledOnce();
  });

  it('desliga no aparelho mesmo se o servidor falhar', async () => {
    const assinatura = jaAssinado();
    api.cancelar.mockRejectedValueOnce(new ApiError('Servidor indisponível.', 503));
    abrir();
    await userEvent.click(await desligar());
    expect(await ligar()).toBeInTheDocument();
    expect(assinatura.unsubscribe).toHaveBeenCalledOnce();
  });

  it('se nada desligou, continua ligado e mostra o erro', async () => {
    const assinatura = jaAssinado();
    assinatura.unsubscribe.mockRejectedValueOnce(new Error('falhou'));
    api.cancelar.mockRejectedValueOnce(new ApiError('Servidor indisponível.', 503));
    abrir();
    await userEvent.click(await desligar());
    expect(await screen.findByText('Servidor indisponível.')).toBeInTheDocument();
    expect(await desligar()).toBeInTheDocument();
  });
});

describe('Navegador que não confirma o encerramento', () => {
  it('se o servidor também falhar e a assinatura continuar, segue ligado e mostra o erro', async () => {
    const assinatura = jaAssinado();
    assinatura.unsubscribe.mockResolvedValue(false);
    api.cancelar.mockRejectedValueOnce(new ApiError('Servidor indisponível.', 503));
    abrir();
    await userEvent.click(await desligar());
    expect(await screen.findByText('Servidor indisponível.')).toBeInTheDocument();
    expect(await desligar()).toBeInTheDocument();
    expect(screen.getByText('Ligados')).toBeInTheDocument();
  });

  it('se o servidor cancelou, fica desligado', async () => {
    jaAssinado().unsubscribe.mockResolvedValue(false);
    abrir();
    await userEvent.click(await desligar());
    expect(await ligar()).toBeInTheDocument();
  });

  it('se a assinatura já não existe mais, fica desligado mesmo sem o servidor', async () => {
    jaAssinado().unsubscribe.mockImplementation(async () => {
      navegador.assinatura = null;
      return false;
    });
    api.cancelar.mockRejectedValueOnce(new ApiError('Servidor indisponível.', 503));
    abrir();
    await userEvent.click(await desligar());
    expect(await ligar()).toBeInTheDocument();
  });

  it('não reaproveita a assinatura de outra conta que não pôde ser encerrada', async () => {
    jaAssinado().unsubscribe.mockResolvedValue(false);
    api.situacao.mockResolvedValue({ ativa: false });
    abrir();
    await userEvent.click(await ligar());
    expect(await screen.findByText(/Não foi possível encerrar a assinatura anterior/)).toBeInTheDocument();
    expect(navegador.assinar).not.toHaveBeenCalled();
    expect(api.assinar).not.toHaveBeenCalled();
  });
});

/** Cada `render` é uma aba: o estado de cada uma é próprio, e o navegador e a trava são os mesmos. */
describe('Operações ao mesmo tempo', () => {
  // Todas usam a mesma trava, que o navegador compartilha entre as abas
  afterEach(() => {
    expect(travas).toContain('fsph-push');
    expect([...new Set(travas)].every((nome) => ['fsph-push', 'fsph-apresentacao-push', 'fsph-push-barreira-v1'].includes(nome))).toBe(true);
  });

  const abrirAba = () => {
    const { baseElement, unmount } = render(tela(), { container: document.body.appendChild(document.createElement('div')) });
    const janelas = within(baseElement).getAllByRole('dialog', { hidden: true });
    return { aba: within(janelas[janelas.length - 1]), unmount };
  };

  it('ligar nas duas cria uma assinatura só', async () => {
    const { aba: a } = abrirAba();
    const { aba: b } = abrirAba();
    const botaoA = await a.findByRole('button', { name: 'Ligar alertas', hidden: true });
    const botaoB = await b.findByRole('button', { name: 'Ligar alertas', hidden: true });
    fireEvent.click(botaoA);
    fireEvent.click(botaoB);
    expect(await a.findByText('Ligados')).toBeInTheDocument();
    expect(await b.findByText('Ligados')).toBeInTheDocument();
    expect(navegador.assinar).toHaveBeenCalledOnce();
    expect(api.assinar).toHaveBeenCalledOnce();
    expect(navegador.assinatura?.unsubscribe).not.toHaveBeenCalled();
  });

  it('desligar em uma não remove a assinatura que a outra acabou de criar', async () => {
    const antiga = jaAssinado();
    const { aba: a } = abrirAba();
    const botaoA = await a.findByRole('button', { name: 'Desligar neste aparelho', hidden: true });
    api.situacao.mockResolvedValueOnce({ ativa: false });
    const { aba: b } = abrirAba();
    const botaoB = await b.findByRole('button', { name: 'Ligar alertas', hidden: true });

    let cancelar: () => void = () => undefined;
    api.cancelar.mockReturnValueOnce(new Promise<void>((resolve) => { cancelar = resolve; }));
    fireEvent.click(botaoA);
    await waitFor(() => expect(api.cancelar).toHaveBeenCalledOnce());
    fireEvent.click(botaoB);
    await act(async () => undefined);
    expect(navegador.assinar).not.toHaveBeenCalled();

    await act(async () => cancelar());
    await waitFor(() => expect(api.assinar).toHaveBeenCalledOnce());
    expect(await b.findByText('Ligados')).toBeInTheDocument();
    expect(antiga.unsubscribe).toHaveBeenCalledOnce();
    expect(navegador.assinatura?.endpoint).toBe('https://push.exemplo/novo');
    expect(navegador.assinatura?.unsubscribe).not.toHaveBeenCalled();
    expect(api.cancelar).toHaveBeenCalledExactlyOnceWith('https://push.exemplo/atual', expect.anything());
  });

  it('a conferência do login não encerra uma ativação pela metade', async () => {
    let registrada = false;
    let registrar: () => void = () => undefined;
    api.assinar.mockReturnValueOnce(new Promise<void>((resolve) => {
      registrar = () => { registrada = true; resolve(); };
    }));
    api.situacao.mockImplementation(async () => ({ ativa: registrada, ...(registrada ? { vinculo: VINCULO_TESTE } : {}) }));
    const { aba } = abrirAba();
    fireEvent.click(await aba.findByRole('button', { name: 'Ligar alertas', hidden: true }));
    await waitFor(() => expect(api.assinar).toHaveBeenCalledOnce());

    renderHook(() => useVinculoPush(1));
    await act(async () => undefined);
    expect(api.situacao).not.toHaveBeenCalled();
    await act(async () => registrar());
    await waitFor(() => expect(api.situacao).toHaveBeenCalled());
    expect(navegador.assinatura?.unsubscribe).not.toHaveBeenCalled();
    expect(await aba.findByText('Ligados')).toBeInTheDocument();
  });

  it('fechar e reabrir a janela no meio da ativação mostra o resultado final', async () => {
    let registrar: () => void = () => undefined;
    api.assinar.mockReturnValueOnce(new Promise<void>((resolve) => { registrar = resolve; }));
    const { aba, unmount } = abrirAba();
    fireEvent.click(await aba.findByRole('button', { name: 'Ligar alertas', hidden: true }));
    await waitFor(() => expect(api.assinar).toHaveBeenCalledOnce());
    unmount();

    const { aba: reaberta } = abrirAba();
    expect(await reaberta.findByText('Verificando este aparelho...')).toBeInTheDocument();
    await act(async () => registrar());
    expect(await reaberta.findByText('Ligados')).toBeInTheDocument();
    expect(navegador.assinar).toHaveBeenCalledOnce();
  });
});

describe('Navegador sem Web Locks', () => {
  beforeEach(() => { delete (navigator as unknown as Record<string, unknown>).locks; });

  it('não oferece ligar e explica', async () => {
    navegador.permissao = 'granted';
    abrir();
    expect(await screen.findByText(/Este navegador não recebe alertas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ligar alertas' })).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/Viagens/)).toBeEnabled();
  });

  it('ainda encerra o que ficou marcado', async () => {
    const antiga = jaAssinado();
    marcarEncerramento();
    renderHook(() => useVinculoPush(1));
    await waitFor(() => expect(antiga.unsubscribe).toHaveBeenCalledOnce());
    expect(navegador.assinatura).toBeNull();
  });
});

describe('Encerramento que ficou marcado ao sair', () => {
  it('é cumprido antes de mostrar a situação, mesmo que o servidor ainda diga que vale', async () => {
    const antiga = jaAssinado();
    marcarEncerramento();
    abrir();
    expect(await ligar()).toBeInTheDocument();
    expect(antiga.unsubscribe).toHaveBeenCalledOnce();
    expect(api.situacao).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it.each([
    ['responde false', async () => false],
    ['dá erro', async () => { throw new Error('texto do navegador'); }],
  ])('se o navegador %s, avisa e deixa tentar de novo', async (_, falha) => {
    const antiga = jaAssinado();
    antiga.unsubscribe.mockImplementationOnce(falha);
    marcarEncerramento();
    abrir();
    expect(await screen.findByText(/Não foi possível encerrar os alertas anteriores/)).toBeInTheDocument();
    expect(localStorage).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await ligar()).toBeInTheDocument();
    expect(localStorage).toHaveLength(0);
  });

  it('não atinge a assinatura ligada depois', async () => {
    jaAssinado();
    marcarEncerramento();
    abrir();
    await userEvent.click(await ligar());
    await desligar();
    renderHook(() => useVinculoPush(1));
    await act(async () => undefined);
    expect(navegador.assinatura?.endpoint).toBe('https://push.exemplo/novo');
    expect(navegador.assinatura?.unsubscribe).not.toHaveBeenCalled();
  });

  it('marcado com a tela aberta, também vem antes de ligar', async () => {
    navegador.permissao = 'granted';
    abrir();
    const botao = await ligar();
    const deOutraConta = jaAssinado();
    deOutraConta.unsubscribe.mockResolvedValueOnce(false);
    marcarEncerramento();
    await userEvent.click(botao);
    expect(await screen.findByText(/Não foi possível encerrar os alertas anteriores/)).toBeInTheDocument();
    expect(api.assinar).not.toHaveBeenCalled();
  });

  it('funciona com o armazenamento do navegador bloqueado', async () => {
    const bloqueio = () => { throw new Error('bloqueado'); };
    const espioes = (['getItem', 'setItem', 'removeItem'] as const).map((m) => vi.spyOn(Storage.prototype, m).mockImplementation(bloqueio));
    const antiga = jaAssinado();
    marcarEncerramento();
    renderHook(() => useVinculoPush(1));
    await waitFor(() => expect(antiga.unsubscribe).toHaveBeenCalledOnce());
    espioes.forEach((e) => e.mockRestore());
  });
});

describe('Estado do aparelho', () => {
  it('ligou em outra aba: esta acompanha', async () => {
    const canais: { onmessage?: () => void }[] = [];
    vi.stubGlobal('BroadcastChannel', class {
      onmessage?: () => void;
      constructor() { canais.push(this); }
      postMessage() { canais.filter((c) => c !== this).forEach((c) => c.onmessage?.()); }
      close() { canais.splice(canais.indexOf(this), 1); }
    });
    render(tela());
    render(tela());
    const botoes = await screen.findAllByRole('button', { name: 'Ligar alertas', hidden: true });
    expect(botoes).toHaveLength(2);
    navegador.permissao = 'granted';
    fireEvent(window, new Event('focus'));
    fireEvent.click(botoes[0]);
    await waitFor(() => expect(screen.getAllByText('Ligados')).toHaveLength(2));
    vi.unstubAllGlobals();
  });

  it('permissão concedida sem assinatura: aparece desligado', async () => {
    navegador.permissao = 'granted';
    abrir();
    expect(await screen.findByText('Desligados')).toBeInTheDocument();
    expect(api.situacao).not.toHaveBeenCalled();
  });

  it('assinatura de outra conta: aparece desligado e, ao ligar, cria uma nova', async () => {
    const antiga = jaAssinado();
    api.situacao.mockImplementation(async (endpoint) => ({
      ativa: endpoint === 'https://push.exemplo/novo' && api.assinar.mock.calls.length > 0,
      ...(endpoint === 'https://push.exemplo/novo' && api.assinar.mock.calls.length > 0 ? { vinculo: VINCULO_TESTE } : {}),
    }));
    abrir();
    await userEvent.click(await ligar());
    await desligar();
    expect(antiga.unsubscribe).toHaveBeenCalledOnce();
    expect(api.assinar).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ endpoint: 'https://push.exemplo/novo' }), expect.any(AbortSignal),
    );
  });

  it('não conseguiu conferir: avisa e permite tentar de novo', async () => {
    jaAssinado();
    api.situacao.mockRejectedValueOnce(new ApiError('Servidor indisponível.', 503));
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await desligar()).toBeInTheDocument();
    expect(screen.queryByText('Servidor indisponível.')).not.toBeInTheDocument();
  });

  it('permissão revogada nas configurações: a tela acompanha ao voltar', async () => {
    jaAssinado();
    abrir();
    await desligar();
    navegador.permissao = 'denied';
    navegador.assinatura = null;
    fireEvent(window, new Event('focus'));
    expect(await screen.findByText('Bloqueados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desligar neste aparelho' })).not.toBeInTheDocument();
  });

  it('navegador sem suporte: explica e mantém as categorias', async () => {
    semPush();
    abrir();
    expect(await screen.findByText(/Este navegador não recebe alertas/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/Viagens/)).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Ligar alertas' })).not.toBeInTheDocument();
  });

  it('iPhone fora do aplicativo instalado: orienta a instalar', async () => {
    semPush();
    const agente = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
    abrir();
    expect(await screen.findByText(/só funcionam com o aplicativo instalado/)).toBeInTheDocument();
    agente.mockRestore();
  });

  it('sem conexão: não consulta nada e volta sozinho quando conectar', async () => {
    jaAssinado();
    definir(navigator, 'onLine', false);
    abrir();
    expect(screen.getByText(/Sem conexão. Conecte-se/)).toBeInTheDocument();
    expect(api.situacao).not.toHaveBeenCalled();
    expect(api.preferencias).not.toHaveBeenCalled();

    definir(navigator, 'onLine', true);
    fireEvent(window, new Event('online'));
    expect(await desligar()).toBeEnabled();
    expect(await screen.findByLabelText(/Viagens/)).toBeEnabled();
  });

  it('ao cair a conexão, bloqueia as mudanças', async () => {
    jaAssinado();
    abrir();
    const botao = await desligar();
    const categoria = await screen.findByLabelText(/Viagens/);
    fireEvent(window, new Event('offline'));
    expect(botao).toBeDisabled();
    expect(categoria).toBeDisabled();
  });
});

describe('Troca de conta', () => {
  it('confere de novo e não mostra as categorias da conta anterior', async () => {
    jaAssinado();
    const { rerender } = abrir();
    await desligar();
    await screen.findByLabelText(/Viagens/);

    sessao.id = 2;
    api.situacao.mockResolvedValue({ ativa: false });
    api.preferencias.mockResolvedValue({ categorias: [{ codigo: 'SVO', titulo: 'Coletas SVO', push: true }] });
    rerender(tela());
    expect(await screen.findByLabelText('Coletas SVO')).toBeChecked();
    expect(screen.queryByLabelText(/Viagens/)).not.toBeInTheDocument();
    expect(await ligar()).toBeInTheDocument();
  });

  it('conta trocada durante a ativação não deixa o aparelho assinado', async () => {
    let concluir: () => void = () => undefined;
    api.assinar.mockReturnValueOnce(new Promise<void>((resolve) => { concluir = resolve; }));
    const { rerender } = abrir();
    await userEvent.click(await ligar());
    await waitFor(() => expect(api.assinar).toHaveBeenCalledOnce());

    sessao.id = 2;
    rerender(tela());
    await act(async () => concluir());
    expect(await ligar()).toBeInTheDocument();
    expect(navegador.assinatura).toBeNull();
    expect(screen.queryByText(/A conta mudou/)).not.toBeInTheDocument();
  });
});

describe('Categorias', () => {
  it('mostra as que a API devolve e salva a mudança', async () => {
    abrir();
    const odometro = await screen.findByLabelText('Odômetro');
    expect(screen.getByLabelText(/Viagens/)).toBeChecked();
    expect(odometro).not.toBeChecked();
    await userEvent.click(odometro);
    expect(api.salvarPreferencia).toHaveBeenCalledExactlyOnceWith('ODOMETRO', true);
    await waitFor(() => expect(odometro).toBeEnabled());
    expect(odometro).toBeChecked();
  });

  it('se não salvar, volta ao valor anterior e mostra o erro', async () => {
    api.salvarPreferencia.mockRejectedValueOnce(new ApiError('Não foi possível salvar.', 500));
    abrir();
    const viagens = await screen.findByLabelText(/Viagens/);
    await userEvent.click(viagens);
    expect(await screen.findByText('Não foi possível salvar.')).toBeInTheDocument();
    expect(viagens).toBeChecked();
  });

  it('mudar uma categoria não trava nem desfaz a outra', async () => {
    let falhar: (e: Error) => void = () => undefined;
    api.salvarPreferencia.mockReturnValueOnce(new Promise((_, rejeitar) => { falhar = rejeitar; }));
    abrir();
    const viagens = await screen.findByLabelText(/Viagens/);
    const odometro = screen.getByLabelText('Odômetro');
    await userEvent.click(viagens);
    expect(viagens).toBeDisabled();
    await userEvent.click(odometro);
    await waitFor(() => expect(odometro).toBeEnabled());
    await act(async () => falhar(new ApiError('Não foi possível salvar.', 500)));
    expect(viagens).toBeChecked();
    expect(odometro).toBeChecked();
  });

  it('erro ao carregar permite tentar de novo, sem atrapalhar os alertas', async () => {
    api.preferencias.mockRejectedValueOnce(new ApiError('Servidor indisponível.', 503));
    abrir();
    expect(await ligar()).toBeEnabled();
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar categorias de novo' }));
    expect(await screen.findByLabelText(/Viagens/)).toBeInTheDocument();
  });

  it('perfil sem categorias', async () => {
    api.preferencias.mockResolvedValue({ categorias: [] });
    abrir();
    expect(await screen.findByText(/Nenhuma categoria disponível/)).toBeInTheDocument();
  });
});
