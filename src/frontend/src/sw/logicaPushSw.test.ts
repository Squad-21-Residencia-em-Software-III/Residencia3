import { describe, expect, it, vi } from 'vitest';
import {
  BADGE_NOTIFICACAO_PADRAO,
  ICONE_NOTIFICACAO_PADRAO,
  TIPO_MSG_NAVEGAR_NOTIFICACAO,
  TIPO_MSG_PUSH_FOREGROUND,
  TIPO_MSG_SKIP_WAITING,
  extrairPayloadPush,
  normalizarUrlPush,
  tratarCliqueNotificacao,
  tratarEventoPush,
  tratarMensagemSw,
} from './logicaPushSw';
import type { ClienteJanelaSw } from './logicaPushSw';

function criarJanela(overrides: Partial<ClienteJanelaSw> = {}): ClienteJanelaSw {
  return {
    url: 'https://frota.fsph.se.gov.br/inicio',
    focused: false,
    visibilityState: 'hidden',
    focus: vi.fn().mockResolvedValue(undefined),
    postMessage: vi.fn(),
    ...overrides,
  };
}

describe('logicaPushSw', () => {
  describe('normalizarUrlPush e extrairPayloadPush', () => {
    it('aceita apenas rotas internas válidas e bloqueia URLs externas ou malformadas', () => {
      expect(normalizarUrlPush('/viagens')).toBe('/viagens');
      expect(normalizarUrlPush('/solicitacoes?aba=svo&id=7')).toBe('/solicitacoes?aba=svo&id=7');
      expect(normalizarUrlPush('https://evil.example/viagens')).toBe('/');
      expect(normalizarUrlPush('//evil.example/viagens')).toBe('/');
      expect(normalizarUrlPush('javascript:alert(1)')).toBe('/');
      expect(normalizarUrlPush('/viagens\\teste')).toBe('/');
      expect(normalizarUrlPush('/viagens com espaco')).toBe('/');
      expect(normalizarUrlPush(null)).toBe('/');
    });

    it('interpreta payload JSON oficial do SCRUM-237 e aplica fallbacks para texto/vazio', () => {
      expect(
        extrairPayloadPush(
          JSON.stringify({
            notificacao_id: 42,
            titulo: 'Viagem agendada',
            corpo: 'Veículo alocado para 14:00.',
            url: '/viagens',
            tag: 'viagem-42',
          }),
        ),
      ).toEqual({
        notificacao_id: 42,
        titulo: 'Viagem agendada',
        corpo: 'Veículo alocado para 14:00.',
        url: '/viagens',
        tag: 'viagem-42',
      });

      expect(extrairPayloadPush('Aviso em texto puro')).toEqual({
        notificacao_id: null,
        titulo: 'Frota FSPH',
        corpo: 'Aviso em texto puro',
        url: '/',
      });

      expect(extrairPayloadPush(null)).toEqual({
        notificacao_id: null,
        titulo: 'Frota FSPH',
        corpo: 'Você recebeu uma nova notificação.',
        url: '/',
      });
    });
  });

  describe('tratarEventoPush', () => {
    const payload = extrairPayloadPush(
      JSON.stringify({
        notificacao_id: 77,
        titulo: 'Coleta SVO alocada',
        corpo: 'Equipe definida para a ordem #77.',
        url: '/minhas-coletas',
        tag: 'ordem-svo-77',
      }),
    );

    it('envia postMessage em primeiro plano sem duplicar alerta do SO quando há aba focada fora de /login', async () => {
      const janelaFocada = criarJanela({
        url: 'https://frota.fsph.se.gov.br/viagens',
        focused: true,
        visibilityState: 'visible',
      });
      const exibirNotificacao = vi.fn().mockResolvedValue(undefined);
      const definirBadgeGenerico = vi.fn().mockResolvedValue(undefined);

      const resultado = await tratarEventoPush(payload, {
        origem: 'https://frota.fsph.se.gov.br',
        listarJanelas: async () => [janelaFocada],
        exibirNotificacao,
        definirBadgeGenerico,
      });

      expect(resultado.modo).toBe('foreground');
      expect(janelaFocada.postMessage).toHaveBeenCalledWith({
        tipo: TIPO_MSG_PUSH_FOREGROUND,
        payload,
      });
      expect(exibirNotificacao).not.toHaveBeenCalled();
      expect(definirBadgeGenerico).not.toHaveBeenCalled();
    });

    it('exibe showNotification com icon, badge 72x72, tag e chama App Badging quando em segundo plano ou em /login', async () => {
      const janelaLogin = criarJanela({
        url: 'https://frota.fsph.se.gov.br/login',
        focused: true,
        visibilityState: 'visible',
      });
      const exibirNotificacao = vi.fn().mockResolvedValue(undefined);
      const definirBadgeGenerico = vi.fn().mockRejectedValue(new Error('sem suporte'));

      const resultado = await tratarEventoPush(payload, {
        origem: 'https://frota.fsph.se.gov.br',
        listarJanelas: async () => [janelaLogin],
        exibirNotificacao,
        definirBadgeGenerico,
      });

      expect(resultado.modo).toBe('background');
      expect(exibirNotificacao).toHaveBeenCalledWith('Coleta SVO alocada', {
        body: 'Equipe definida para a ordem #77.',
        icon: ICONE_NOTIFICACAO_PADRAO,
        badge: BADGE_NOTIFICACAO_PADRAO,
        tag: 'ordem-svo-77',
        data: {
          notificacao_id: 77,
          url: '/minhas-coletas',
        },
      });
      expect(definirBadgeGenerico).toHaveBeenCalledTimes(1);
    });
  });

  describe('tratarCliqueNotificacao', () => {
    it('fecha o alerta, foca aba existente da mesma origem e envia postMessage com URL sanitizada', async () => {
      const fecharNotificacao = vi.fn();
      const abrirJanela = vi.fn().mockResolvedValue(undefined);
      const abaOculta = criarJanela({
        url: 'https://frota.fsph.se.gov.br/inicio',
        visibilityState: 'hidden',
      });
      const abaVisivel = criarJanela({
        url: 'https://frota.fsph.se.gov.br/viagens',
        visibilityState: 'visible',
      });

      const resultado = await tratarCliqueNotificacao(
        { notificacao_id: 91, url: '/solicitacoes?aba=svo' },
        {
          origem: 'https://frota.fsph.se.gov.br',
          fecharNotificacao,
          listarJanelas: async () => [abaOculta, abaVisivel],
          abrirJanela,
        },
      );

      expect(fecharNotificacao).toHaveBeenCalledTimes(1);
      expect(resultado).toEqual({ acao: 'focar_existente', url: '/solicitacoes?aba=svo' });
      expect(abaVisivel.focus).toHaveBeenCalledTimes(1);
      expect(abaVisivel.postMessage).toHaveBeenCalledWith({
        tipo: TIPO_MSG_NAVEGAR_NOTIFICACAO,
        url: '/solicitacoes?aba=svo',
        notificacao_id: 91,
      });
      expect(abrirJanela).not.toHaveBeenCalled();
    });

    it('abre nova janela com "/" quando não há aba aberta e a URL recebida é externa', async () => {
      const fecharNotificacao = vi.fn();
      const abrirJanela = vi.fn().mockResolvedValue(undefined);

      const resultado = await tratarCliqueNotificacao(
        { notificacao_id: 92, url: 'https://phishing.example/roubar' },
        {
          origem: 'https://frota.fsph.se.gov.br',
          fecharNotificacao,
          listarJanelas: async () => [],
          abrirJanela,
        },
      );

      expect(fecharNotificacao).toHaveBeenCalledTimes(1);
      expect(resultado).toEqual({ acao: 'abrir_janela', url: '/' });
      expect(abrirJanela).toHaveBeenCalledWith('/');
    });
  });

  describe('tratarMensagemSw', () => {
    it('executa skipWaiting apenas para SKIP_WAITING (evitando reload-loop)', () => {
      const skipWaiting = vi.fn();
      expect(tratarMensagemSw({ type: 'OUTRA_MSG' }, skipWaiting)).toBe(false);
      expect(skipWaiting).not.toHaveBeenCalled();

      expect(tratarMensagemSw({ type: TIPO_MSG_SKIP_WAITING }, skipWaiting)).toBe(true);
      expect(skipWaiting).toHaveBeenCalledTimes(1);
    });
  });
});
