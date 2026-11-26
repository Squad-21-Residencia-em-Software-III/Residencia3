import { describe, expect, it, vi } from 'vitest';
import {
  BADGE_NOTIFICACAO_PADRAO, ICONE_NOTIFICACAO_PADRAO, clienteEmPrimeiroPlano,
  extrairPayloadPush, lerReferenciaPush, tratarCliqueNotificacao, tratarEventoPush, tratarMensagemSw,
} from './logicaPushSw';

const origem = 'https://frota.fsph.local';
const referencia = { notificacao_id: 42, vinculo: 'A'.repeat(43) };
const dados = { ...referencia, titulo: 'Coleta', corpo: 'Confira a coleta.', url: '/viagens', tag: 'ordem-svo-42' };
const cliente = (url: string, focused = false, visibilityState = 'visible') => ({
  url, focused, visibilityState, focus: vi.fn().mockResolvedValue(undefined), postMessage: vi.fn(),
});

describe('validação de Push', () => {
  it('aceita um contrato válido e descarta o destino fornecido pelo Push', () => {
    expect(extrairPayloadPush(JSON.stringify(dados))).toEqual({
      ...referencia, titulo: dados.titulo, corpo: dados.corpo, tag: dados.tag,
    });
    expect(lerReferenciaPush(dados)).toEqual(referencia);
  });

  it.each([
    { notificacao_id: '42' }, { notificacao_id: -1 }, { notificacao_id: 2.5 },
    { notificacao_id: 2147483648 }, { titulo: 'a'.repeat(46) }, { corpo: 'a'.repeat(111) },
    { corpo: 'dados\nreservados' }, { tag: 'com espaço' }, { segredo: 'não exibir' },
    ...['https://externo.invalid', '//externo.invalid', 'javascript:abc', '/a\\b', '/a com espaço', '/%2fexterno'].map((url) => ({ url })),
  ])('usa texto genérico com campos inválidos %j', (invalido) => {
    expect(extrairPayloadPush(JSON.stringify({ ...dados, ...invalido }))).toEqual({
      notificacao_id: null, vinculo: referencia.vinculo, titulo: 'Frota FSPH', corpo: 'Você recebeu uma nova notificação.',
    });
  });

  it.each([null, '', 'texto privado', '[]', '{}', 'x'.repeat(2049)])('nunca exibe o texto bruto %s', (valor) => {
    expect(extrairPayloadPush(valor)).toEqual({
      notificacao_id: null, vinculo: null, titulo: 'Frota FSPH', corpo: 'Você recebeu uma nova notificação.',
    });
  });
});

describe('apresentação e clique no Service Worker', () => {
  it('só considera janelas focadas, visíveis, da origem e fora do login', () => {
    expect(clienteEmPrimeiroPlano(cliente(origem + '/login', true), origem)).toBe(false);
    expect(clienteEmPrimeiroPlano(cliente('https://externo.invalid', true), origem)).toBe(false);
    expect(clienteEmPrimeiroPlano(cliente(origem, true, 'hidden'), origem)).toBe(false);
    expect(clienteEmPrimeiroPlano(cliente(origem), origem)).toBe(false);
    expect(clienteEmPrimeiroPlano(cliente(origem, true), origem)).toBe(true);
  });

  it('envia somente a referência à aba focalizada, sem alerta duplicado', async () => {
    const ativa = cliente(origem + '/viagens', true);
    const outra = cliente(origem);
    const exibirNotificacao = vi.fn();
    const definirBadgeGenerico = vi.fn();
    await tratarEventoPush(extrairPayloadPush(JSON.stringify(dados)), {
      origem, listarJanelas: async () => [outra, ativa], exibirNotificacao, definirBadgeGenerico,
    });
    expect(ativa.postMessage).toHaveBeenCalledWith({ tipo: 'PUSH_EM_PRIMEIRO_PLANO', ...referencia });
    expect(outra.postMessage).not.toHaveBeenCalled();
    expect(exibirNotificacao).not.toHaveBeenCalled();
    expect(definirBadgeGenerico).not.toHaveBeenCalled();
  });

  it('exibe alerta de SO com ícones e tag quando a janela está em segundo plano', async () => {
    const exibirNotificacao = vi.fn();
    const definirBadgeGenerico = vi.fn().mockRejectedValue(new Error('sem suporte'));
    await tratarEventoPush(extrairPayloadPush(JSON.stringify(dados)), {
      origem, listarJanelas: async () => [cliente(origem, false, 'hidden')], exibirNotificacao, definirBadgeGenerico,
    });
    expect(exibirNotificacao).toHaveBeenCalledWith(dados.titulo, {
      body: dados.corpo, icon: ICONE_NOTIFICACAO_PADRAO, badge: BADGE_NOTIFICACAO_PADRAO, tag: dados.tag, data: referencia,
    });
    expect(definirBadgeGenerico).toHaveBeenCalledOnce();
  });

  it('envia o clique só à aba escolhida e abre a raiz com apenas o ID quando fechada', async () => {
    const ativa = cliente(origem + '/login', true);
    const outra = cliente(origem);
    const fecharNotificacao = vi.fn();
    const abrirJanela = vi.fn();
    await tratarCliqueNotificacao(referencia, { origem, listarJanelas: async () => [outra, ativa], fecharNotificacao, abrirJanela });
    expect(fecharNotificacao).toHaveBeenCalledOnce();
    expect(ativa.focus).toHaveBeenCalledOnce();
    expect(ativa.postMessage).toHaveBeenCalledWith({ tipo: 'NAVEGAR_NOTIFICACAO', ...referencia });
    expect(outra.postMessage).not.toHaveBeenCalled();
    expect(abrirJanela).not.toHaveBeenCalled();
    await tratarCliqueNotificacao(referencia, { origem, listarJanelas: async () => [], fecharNotificacao, abrirJanela });
    expect(abrirJanela).toHaveBeenCalledWith('/?aviso=42');
    await tratarCliqueNotificacao(null, { origem, listarJanelas: async () => [], fecharNotificacao, abrirJanela });
    expect(abrirJanela).toHaveBeenLastCalledWith('/');
  });

  it('só aceita o comando exato de atualização Workbox', () => {
    const skipWaiting = vi.fn();
    for (const dado of [null, {}, { type: 'OTHER' }, { type: 'SKIP_WAITING', extra: true }]) {
      expect(tratarMensagemSw(dado, skipWaiting)).toBe(false);
    }
    expect(tratarMensagemSw({ type: 'SKIP_WAITING' }, skipWaiting)).toBe(true);
    expect(skipWaiting).toHaveBeenCalledOnce();
  });
});
