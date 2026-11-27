import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { carregarRecursosOperacionais, politicaOperacionalViagem, VARIAVEIS_RECURSOS_OPERACIONAIS } from '../config/recursosOperacionais';
import { exigirRecursoAtivo } from '../middlewares/exigirRecursoAtivo';

const recursosOriginais = env.recursosOperacionais;
afterEach(() => { env.recursosOperacionais = recursosOriginais; });

describe('Configuração dos recursos operacionais', () => {
  it('desliga todas por padrão e rejeita um valor inválido sem afetar flags independentes', () => {
    expect(Object.values(carregarRecursosOperacionais({ NODE_ENV: 'production' }).flags)).toEqual(Array(Object.keys(VARIAVEIS_RECURSOS_OPERACIONAIS).length).fill(false));
    const { flags, diagnostico } = carregarRecursosOperacionais({
      PORTAL_SVO_ATIVO: 'true', ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true', MAPAS_INTERNOS_ATIVOS: 'sim',
    });
    expect(flags).toMatchObject({ portalSvo: true, acompanhamentoExterno: true, mapasInternos: false, mapasSvo: false });
    expect(diagnostico.invalidas).toEqual([VARIAVEIS_RECURSOS_OPERACIONAIS.mapasInternos]);
  });

  it.each([
    [undefined, undefined, false],
    [undefined, 'true', true],
    ['true', undefined, true],
    ['true', 'true', true],
    ['false', 'true', false],
    ['true', 'false', false],
    ['', 'true', false],
    ['true', 'sim', false],
  ])('resolve portal com flag atual %s e legada %s', (atual, legado, ativo) => {
    const { flags, diagnostico } = carregarRecursosOperacionais({
      PORTAL_SVO_ATIVO: atual, FASE3_PORTAL_SVO: legado,
      ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true',
    });
    expect(flags).toMatchObject({ portalSvo: ativo, acompanhamentoExterno: true });
    const conflito = atual !== undefined && legado !== undefined && atual !== legado;
    expect(diagnostico.conflitantes).toEqual(conflito ? ['PORTAL_SVO_ATIVO'] : []);
    expect(diagnostico.invalidas).toEqual(legado === 'sim' ? ['FASE3_PORTAL_SVO'] : []);
  });

  it('preserva a retenção configurada pelas chaves legadas e bloqueia autorização conflitante', () => {
    const legado = {
      FASE3_RETENCAO_EXTERNA: 'true',
      FASE3_RETENCAO_EXTERNA_INVENTARIO_VALIDADO: 'true',
      FASE3_RETENCAO_EXTERNA_SIMULACAO_VALIDADA: 'true',
      FASE3_RETENCAO_EXTERNA_AUTORIZADA: 'true',
    };
    expect(carregarRecursosOperacionais(legado).flags.retencaoExterna).toBe(true);
    const { flags, diagnostico } = carregarRecursosOperacionais({
      ...legado, RETENCAO_SOLICITACOES_EXTERNAS_SVO_AUTORIZADA: 'false',
    });
    expect(flags.retencaoExterna).toBe(false);
    expect(diagnostico.bloqueadas).toContain('retencaoExterna');
    expect(diagnostico.conflitantes).toEqual(['RETENCAO_SOLICITACOES_EXTERNAS_SVO_AUTORIZADA']);
  });

  it('exige todas as dependências da confirmação e da emergência', () => {
    const pedido = { CONFIRMACAO_AUTOMATICA_PARADAS_ATIVA: 'true', EMERGENCIA_GPS_ATIVA: 'true' };
    const preRequisitos = {
      MULTIPLAS_PARADAS_ATIVAS: 'true', CAPTURA_PERIODICA_GPS_ATIVA: 'true',
      PARAMETROS_CONFIRMACAO_PARADAS_HOMOLOGADOS: 'true',
      GPS_OBRIGATORIO_ATIVO: 'true', EMERGENCIA_GPS_AUTORIZADA: 'true',
    };
    expect(carregarRecursosOperacionais(pedido).diagnostico.bloqueadas).toEqual(['emergenciaGps', 'confirmacaoAutomatica']);
    expect(carregarRecursosOperacionais({ ...pedido, ...preRequisitos }).flags).toMatchObject({ confirmacaoAutomatica: true, emergenciaGps: true });
    for (const nome of Object.keys(preRequisitos)) {
      expect(carregarRecursosOperacionais({ ...pedido, ...preRequisitos, [nome]: 'false' }).diagnostico.bloqueadas).toHaveLength(1);
    }
  });

  it.each(['retencaoGpsCheckpoints', 'retencaoGpsIntermediarios', 'retencaoExterna'] as const)(
    'exige inventário, simulação e autorização próprios para %s', (recurso) => {
    const nome = VARIAVEIS_RECURSOS_OPERACIONAIS[recurso];
    const preRequisitos = ['_INVENTARIO_VALIDADO', '_SIMULACAO_VALIDADA', '_AUTORIZADA'].map((sufixo) => nome.replace(/_ATIVA$/, '') + sufixo);
    const origem = Object.fromEntries([nome, ...preRequisitos].map((chave) => [chave, 'true']));
    expect(carregarRecursosOperacionais(origem).flags[recurso]).toBe(true);
    for (const chave of preRequisitos) {
      expect(carregarRecursosOperacionais({ ...origem, [chave]: 'false' }).flags[recurso]).toBe(false);
    }
    for (const categoria of ['retencaoGpsCheckpoints', 'retencaoGpsIntermediarios', 'retencaoExterna'] as const) {
      expect(carregarRecursosOperacionais(origem).flags[categoria]).toBe(categoria === recurso);
    }
  });

  it('bloqueia novas entradas pelo servidor sem bloquear as rotas operacionais', async () => {
    const app = express();
    const gestor = exigirRecursoAtivo('mapasInternos', 'mapasSvo');
    app.get('/mapas', gestor, (_req, res) => res.sendStatus(204));
    app.post('/viagens/1/finalizar', (_req, res) => res.sendStatus(204));
    const config = carregarRecursosOperacionais({ MAPAS_SVO_ATIVOS: 'true' });
    env.recursosOperacionais = config;
    await request(app).get('/mapas').expect(204);
    env.recursosOperacionais = carregarRecursosOperacionais({});
    await request(app).get('/mapas').expect(404, { erro: 'Rota não encontrada', codigo: 'RECURSO_DESATIVADO' });
    await request(app).post('/viagens/1/finalizar').expect(204);
  });

  it('preserva a política legada mesmo quando a nova saída exige GPS', () => {
    const flags = carregarRecursosOperacionais({ GPS_OBRIGATORIO_ATIVO: 'true', MAPAS_SVO_ATIVOS: 'true' }).flags;
    expect(politicaOperacionalViagem(flags, { estado: 'legada' })).toEqual({
      multiplasParadas: false, mapasSvo: false, gpsObrigatorio: false, capturaPeriodica: false,
    });
    expect(politicaOperacionalViagem(flags, { estado: 'nova' }).gpsObrigatorio).toBe(true);
  });

  it('mantém a política de uma viagem admitida e usa as flags atuais para novas viagens', () => {
    const antes = carregarRecursosOperacionais({ GPS_OBRIGATORIO_ATIVO: 'true', MULTIPLAS_PARADAS_ATIVAS: 'true' }).flags;
    const politicaNaSaida = { ...politicaOperacionalViagem(antes, { estado: 'nova' }) };
    const depois = carregarRecursosOperacionais({ CAPTURA_PERIODICA_GPS_ATIVA: 'true' }).flags;
    const politicaAtual = politicaOperacionalViagem(depois, { estado: 'emAndamento', politicaNaSaida });
    politicaNaSaida.gpsObrigatorio = false;
    politicaNaSaida.capturaPeriodica = true;
    expect(Object.isFrozen(politicaAtual)).toBe(true);
    expect(politicaAtual).toMatchObject({
      gpsObrigatorio: true, multiplasParadas: true, capturaPeriodica: false,
    });
    expect(politicaOperacionalViagem(depois, { estado: 'nova' })).toMatchObject({
      gpsObrigatorio: false, multiplasParadas: false, capturaPeriodica: true,
    });
  });
});
