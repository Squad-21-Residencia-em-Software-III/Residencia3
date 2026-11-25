import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModalPreferenciasPwa } from '../components/pwa/ModalPreferenciasPwa';
import { RECURSOS_BACKEND } from '../config/recursosBackend';
import { authApi } from '../services/api/authApi';
import { ApiError, EVENTO_SESSAO_EXPIRADA, tokenStorage } from '../services/api/http';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import { PERFIS } from '../types/usuario';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../services/api/authApi', () => ({ authApi: { login: vi.fn(), refresh: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/api/notificacoesPushApi', () => ({
  notificacoesPushApi: {
    chavePublica: vi.fn(), assinar: vi.fn(), cancelar: vi.fn(), situacao: vi.fn(), preferencias: vi.fn(),
    salvarPreferencia: vi.fn(),
  },
}));

const api = vi.mocked(notificacoesPushApi);
const recursosOriginais = { ...RECURSOS_BACKEND };

interface AssinaturaFalsa {
  endpoint: string;
  toJSON: () => unknown;
  unsubscribe: () => Promise<boolean>;
}
let assinatura: AssinaturaFalsa | null = null;
let permissao: NotificationPermission = 'default';
const pedirPermissao = vi.fn();
const assinarNavegador = vi.fn();
const encerrada = vi.fn();
let receberDeOutraAba: (evento: { data: unknown }) => void = () => undefined;

function novaAssinatura(endpoint: string): AssinaturaFalsa {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: async () => {
      encerrada(endpoint);
      if (assinatura?.endpoint === endpoint) assinatura = null;
      return true;
    },
  };
}

function definir(alvo: object, nome: string, valor: unknown) {
  Object.defineProperty(alvo, nome, { configurable: true, value: valor });
}

function sessao(id: number) {
  return {
    token: `token-${id}`, tipo: 'Bearer' as const, expiraEm: '2h',
    usuario: {
      id, nome: `Conta ${id}`, email: 'x@exemplo.com', perfil: PERFIS.GESTOR_FROTA,
      tipo_usuario: 'GESTOR_FROTA' as const, ativo: true,
    },
  };
}

/** Como no sistema: sem login, a janela de preferências é desmontada. */
function Sistema() {
  const { usuario, carregando, login, logout } = useAuth();
  if (carregando) return null;
  if (!usuario) return <button type="button" onClick={() => void login('x', 'y')}>Entrar</button>;
  return (
    <>
      <p>{usuario.nome}</p>
      <button type="button" onClick={logout}>Sair</button>
      <ModalPreferenciasPwa isOpen onClose={() => undefined} />
    </>
  );
}

const abrir = () => render(<AuthProvider><Sistema /></AuthProvider>);
const clicar = async (nome: string) => userEvent.click(await screen.findByRole('button', { name: nome }));

beforeEach(() => {
  vi.resetAllMocks();
  RECURSOS_BACKEND.webPush = true;
  assinatura = null;
  permissao = 'default';
  pedirPermissao.mockImplementation(async () => (permissao = 'granted'));
  assinarNavegador.mockImplementation(async () => (assinatura = novaAssinatura('https://push.exemplo/novo')));
  const registro = { pushManager: { getSubscription: async () => assinatura, subscribe: assinarNavegador } };
  definir(window, 'Notification', {
    get permission() { return permissao; },
    requestPermission: pedirPermissao,
  });
  definir(window, 'PushManager', class {});
  let fila: Promise<unknown> = Promise.resolve();
  definir(navigator, 'locks', {
    request: (_: string, acao: () => Promise<unknown>) => {
      const resultado = fila.then(acao);
      fila = resultado.catch(() => undefined);
      return resultado;
    },
  });
  localStorage.clear();
  definir(navigator, 'serviceWorker', { ready: Promise.resolve(registro), getRegistration: async () => registro });
  vi.stubGlobal('BroadcastChannel', class {
    addEventListener = (_: string, ouvir: typeof receberDeOutraAba) => { receberDeOutraAba = ouvir; };
    removeEventListener = () => undefined;
    postMessage = () => undefined;
    close = () => undefined;
  });
  vi.mocked(authApi.refresh).mockResolvedValue(sessao(1));
  vi.mocked(authApi.login).mockResolvedValue(sessao(1));
  vi.mocked(authApi.logout).mockResolvedValue(undefined);
  api.chavePublica.mockResolvedValue({ publicKey: 'AQID' });
  api.assinar.mockResolvedValue(undefined);
  api.cancelar.mockResolvedValue(undefined);
  api.situacao.mockResolvedValue({ ativa: true });
  api.preferencias.mockResolvedValue({ categorias: [{ codigo: 'VIAGENS', titulo: 'Viagens', push: true }] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(RECURSOS_BACKEND, recursosOriginais);
  for (const nome of ['Notification', 'PushManager']) delete (window as unknown as Record<string, unknown>)[nome];
  for (const nome of ['serviceWorker', 'locks']) delete (navigator as unknown as Record<string, unknown>)[nome];
  localStorage.clear();
});

/** Aparelho já com alertas ligados para a conta 1. */
async function abrirLigado() {
  permissao = 'granted';
  assinatura = novaAssinatura('https://push.exemplo/atual');
  abrir();
  await screen.findByRole('button', { name: 'Desligar neste aparelho' });
}

const fimDaSessao = {
  'sair da conta': () => clicar('Sair'),
  'sair em outra aba': async () => act(async () => receberDeOutraAba({ data: { tipo: 'LOGOUT' } })),
  'sessão expirada': async () => act(async () => void window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))),
};

describe.each(Object.entries(fimDaSessao))('%s durante a ativação', (_, encerrar) => {
  it('com o registro no servidor pendente, desfaz no navegador e no servidor', async () => {
    api.assinar.mockReturnValueOnce(new Promise(() => undefined));
    abrir();
    await clicar('Ligar alertas');
    await waitFor(() => expect(api.assinar).toHaveBeenCalledOnce());

    await encerrar();
    expect(screen.queryByText('Alertas neste aparelho')).not.toBeInTheDocument();
    await waitFor(() => expect(assinatura).toBeNull());
    expect(api.cancelar).toHaveBeenCalledWith(
      'https://push.exemplo/novo', expect.objectContaining({ token: 'token-1' }),
    );
  });

  it('com o navegador ainda assinando, não registra no servidor', async () => {
    let concluir: () => void = () => undefined;
    assinarNavegador.mockImplementationOnce(() => new Promise((resolve) => {
      concluir = () => resolve((assinatura = novaAssinatura('https://push.exemplo/novo')));
    }));
    abrir();
    await clicar('Ligar alertas');
    await waitFor(() => expect(assinarNavegador).toHaveBeenCalledOnce());

    await encerrar();
    await act(async () => concluir());
    await waitFor(() => expect(encerrada).toHaveBeenCalledWith('https://push.exemplo/novo'));
    expect(assinatura).toBeNull();
    expect(api.assinar).not.toHaveBeenCalled();
  });

  it('com a chave pública pendente, não assina', async () => {
    let responder: (v: { publicKey: string }) => void = () => undefined;
    api.chavePublica.mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));
    abrir();
    await clicar('Ligar alertas');
    await waitFor(() => expect(api.chavePublica).toHaveBeenCalledOnce());

    await encerrar();
    await act(async () => responder({ publicKey: 'AQID' }));
    expect(assinarNavegador).not.toHaveBeenCalled();
  });

  it('com o pedido de permissão aberto, não assina', async () => {
    let permitir: () => void = () => undefined;
    pedirPermissao.mockReturnValueOnce(new Promise((resolve) => {
      permitir = () => resolve((permissao = 'granted'));
    }));
    abrir();
    await clicar('Ligar alertas');
    await encerrar();
    await act(async () => permitir());
    expect(api.chavePublica).not.toHaveBeenCalled();
    expect(assinarNavegador).not.toHaveBeenCalled();
  });

  it('a operação interrompida não prende nem atinge a próxima conta', async () => {
    api.assinar.mockReturnValueOnce(new Promise(() => undefined));
    vi.mocked(authApi.login).mockResolvedValueOnce(sessao(2));
    abrir();
    await clicar('Ligar alertas');
    await waitFor(() => expect(api.assinar).toHaveBeenCalledOnce());
    await encerrar();

    await clicar('Entrar');
    await screen.findByText('Conta 2');
    await clicar('Ligar alertas');
    expect(await screen.findByRole('button', { name: 'Desligar neste aparelho' })).toBeInTheDocument();
    expect(assinatura).not.toBeNull();
    expect(api.assinar).toHaveBeenCalledTimes(2);
  });
});

describe('Sair da conta', () => {
  it('cancela no servidor com o token da sessão e encerra no navegador', async () => {
    await abrirLigado();
    await clicar('Sair');
    expect(tokenStorage.get()).toBeNull();
    await waitFor(() => expect(assinatura).toBeNull());
    expect(api.cancelar).toHaveBeenCalledExactlyOnceWith(
      'https://push.exemplo/atual', expect.objectContaining({ token: 'token-1' }),
    );
  });

  it.each([
    ['falha', () => Promise.reject(new ApiError('Servidor indisponível.', 503))],
    ['não responde', () => new Promise<void>(() => undefined)],
  ])('sai na hora e encerra no navegador mesmo se o servidor %s', async (_, resposta) => {
    api.cancelar.mockImplementationOnce(resposta);
    await abrirLigado();
    await clicar('Sair');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledOnce();
    await waitFor(() => expect(assinatura).toBeNull());
  });

  it('ao entrar de novo, um toque religa, sem novo pedido de permissão e com as categorias da conta', async () => {
    await abrirLigado();
    await clicar('Sair');
    await waitFor(() => expect(assinatura).toBeNull());

    await clicar('Entrar');
    expect(await screen.findByLabelText('Viagens')).toBeChecked();
    const pedidos = assinarNavegador.mock.calls.length;
    await clicar('Ligar alertas');
    await screen.findByRole('button', { name: 'Desligar neste aparelho' });
    expect(assinarNavegador).toHaveBeenCalledTimes(pedidos + 1);
    expect(api.salvarPreferencia).not.toHaveBeenCalled();
  });
});

describe('Navegador que falha ao sair', () => {
  /** A assinatura resiste até `liberar`. */
  async function abrirComFalha(falha: () => Promise<boolean>) {
    let resistir = true;
    permissao = 'granted';
    assinatura = novaAssinatura('https://push.exemplo/atual');
    const encerrar = assinatura.unsubscribe;
    assinatura.unsubscribe = () => (resistir ? falha() : encerrar());
    const tela = abrir();
    await screen.findByRole('button', { name: 'Desligar neste aparelho' });
    return { tela, liberar: () => { resistir = false; } };
  }
  const falhas: [string, () => Promise<boolean>][] = [
    ['responde false', async () => false],
    ['dá erro', async () => { throw new Error('falhou'); }],
  ];

  it.each(falhas)('%s: sai na hora e encerra quando a conexão volta, sem ninguém logado', async (_, falha) => {
    const { liberar } = await abrirComFalha(falha);
    await clicar('Sair');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(assinatura).not.toBeNull();

    liberar();
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(assinatura).toBeNull());
    expect(localStorage).toHaveLength(0);
  });

  it('fechar o aplicativo não esquece: encerra ao abrir de novo', async () => {
    const { tela, liberar } = await abrirComFalha(async () => false);
    await clicar('Sair');
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    tela.unmount();
    expect(assinatura).not.toBeNull();

    liberar();
    vi.mocked(authApi.refresh).mockRejectedValueOnce(new Error('sem sessão'));
    abrir();
    await waitFor(() => expect(assinatura).toBeNull());
  });

  it('a próxima conta não herda os alertas, mesmo que o servidor diga que valem', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce(sessao(2));
    const { liberar } = await abrirComFalha(async () => false);
    await clicar('Sair');
    liberar();
    await clicar('Entrar');
    await screen.findByText('Conta 2');
    expect(await screen.findByRole('button', { name: 'Ligar alertas' })).toBeInTheDocument();
    expect(assinatura).toBeNull();
  });

  it('sem encerrar, o servidor ainda é avisado com o token da sessão', async () => {
    await abrirComFalha(async () => false);
    await clicar('Sair');
    await waitFor(() => expect(api.cancelar).toHaveBeenCalledWith(
      'https://push.exemplo/atual', expect.objectContaining({ token: 'token-1' }),
    ));
  });
});

describe('Sem sair da conta', () => {
  it('sessão expirada mantém os alertas', async () => {
    await abrirLigado();
    await fimDaSessao['sessão expirada']();
    await screen.findByRole('button', { name: 'Entrar' });
    expect(localStorage).toHaveLength(0);
    expect(encerrada).not.toHaveBeenCalled();
    expect(api.cancelar).not.toHaveBeenCalled();
  });

  it('fechar o aplicativo mantém os alertas', async () => {
    permissao = 'granted';
    assinatura = novaAssinatura('https://push.exemplo/atual');
    const { unmount } = abrir();
    await screen.findByRole('button', { name: 'Desligar neste aparelho' });
    unmount();
    expect(encerrada).not.toHaveBeenCalled();
    expect(api.cancelar).not.toHaveBeenCalled();
  });
});
