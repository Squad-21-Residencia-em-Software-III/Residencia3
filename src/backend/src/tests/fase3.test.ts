import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { carregarFase3, politicaViagemFase3, VARIAVEIS_FASE3 } from '../config/fase3';
import { exigirRecursoFase3 } from '../middlewares/exigirRecursoFase3';

const fase3Original = env.fase3;
afterEach(() => { env.fase3 = fase3Original; });

describe('Infraestrutura da Fase 3', () => {
  it('desliga todas por padrão e rejeita um valor inválido sem afetar flags independentes', () => {
    expect(Object.values(carregarFase3({ NODE_ENV: 'production' }).flags)).toEqual(Array(Object.keys(VARIAVEIS_FASE3).length).fill(false));
    const { flags, diagnostico } = carregarFase3({
      FASE3_PORTAL_SVO: 'true', FASE3_ACOMPANHAMENTO_EXTERNO: 'true', FASE3_MAPAS_INTERNOS: 'sim',
    });
    expect(flags).toMatchObject({ portalSvo: true, acompanhamentoExterno: true, mapasInternos: false, mapasSvo: false });
    expect(diagnostico.invalidas).toEqual([VARIAVEIS_FASE3.mapasInternos]);
  });

  it('exige todas as dependências da confirmação e da emergência', () => {
    const pedido = { FASE3_CONFIRMACAO_AUTOMATICA: 'true', FASE3_EMERGENCIA_GPS: 'true' };
    const preRequisitos = {
      FASE3_MULTIPLAS_PARADAS: 'true', FASE3_CAPTURA_PERIODICA: 'true',
      FASE3_PARAMETROS_CONFIRMACAO_HOMOLOGADOS: 'true',
      FASE3_GPS_OBRIGATORIO: 'true', FASE3_EMERGENCIA_GPS_AUTORIZADA: 'true',
    };
    expect(carregarFase3(pedido).diagnostico.bloqueadas).toEqual(['emergenciaGps', 'confirmacaoAutomatica']);
    expect(carregarFase3({ ...pedido, ...preRequisitos }).flags).toMatchObject({ confirmacaoAutomatica: true, emergenciaGps: true });
    for (const nome of Object.keys(preRequisitos)) {
      expect(carregarFase3({ ...pedido, ...preRequisitos, [nome]: 'false' }).diagnostico.bloqueadas).toHaveLength(1);
    }
  });

  it.each(['retencaoGpsCheckpoints', 'retencaoGpsIntermediarios', 'retencaoExterna'] as const)(
    'exige inventário, simulação e autorização próprios para %s', (recurso) => {
    const nome = VARIAVEIS_FASE3[recurso];
    const preRequisitos = ['_INVENTARIO_VALIDADO', '_SIMULACAO_VALIDADA', '_AUTORIZADA'].map((sufixo) => nome + sufixo);
    const origem = Object.fromEntries([nome, ...preRequisitos].map((chave) => [chave, 'true']));
    expect(carregarFase3(origem).flags[recurso]).toBe(true);
    for (const chave of preRequisitos) {
      expect(carregarFase3({ ...origem, [chave]: 'false' }).flags[recurso]).toBe(false);
    }
    for (const categoria of ['retencaoGpsCheckpoints', 'retencaoGpsIntermediarios', 'retencaoExterna'] as const) {
      expect(carregarFase3(origem).flags[categoria]).toBe(categoria === recurso);
    }
  });

  it('bloqueia novas entradas pelo servidor sem bloquear as rotas operacionais', async () => {
    const app = express();
    const gestor = exigirRecursoFase3('mapasInternos', 'mapasSvo');
    app.get('/mapas', gestor, (_req, res) => res.sendStatus(204));
    app.post('/viagens/1/finalizar', (_req, res) => res.sendStatus(204));
    const config = carregarFase3({ FASE3_MAPAS_SVO: 'true' });
    env.fase3 = config;
    await request(app).get('/mapas').expect(204);
    env.fase3 = carregarFase3({});
    await request(app).get('/mapas').expect(404, { erro: 'Rota não encontrada', codigo: 'RECURSO_DESATIVADO' });
    await request(app).post('/viagens/1/finalizar').expect(204);
  });

  it('preserva a política legada mesmo quando a nova saída exige GPS', () => {
    const flags = carregarFase3({ FASE3_GPS_OBRIGATORIO: 'true', FASE3_MAPAS_SVO: 'true' }).flags;
    expect(politicaViagemFase3(flags, { estado: 'legada' })).toEqual({
      multiplasParadas: false, mapasSvo: false, gpsObrigatorio: false, capturaPeriodica: false,
    });
    expect(politicaViagemFase3(flags, { estado: 'nova' }).gpsObrigatorio).toBe(true);
  });

  it('mantém a política de uma viagem admitida e usa as flags atuais para novas viagens', () => {
    const antes = carregarFase3({ FASE3_GPS_OBRIGATORIO: 'true', FASE3_MULTIPLAS_PARADAS: 'true' }).flags;
    const politicaNaSaida = politicaViagemFase3(antes, { estado: 'nova' });
    const depois = carregarFase3({ FASE3_CAPTURA_PERIODICA: 'true' }).flags;
    const politicaAtual = politicaViagemFase3(depois, { estado: 'emAndamento', politicaNaSaida });
    expect(Object.isFrozen(politicaAtual)).toBe(true);
    expect(politicaAtual).toMatchObject({
      gpsObrigatorio: true, multiplasParadas: true, capturaPeriodica: false,
    });
    expect(politicaViagemFase3(depois, { estado: 'nova' })).toMatchObject({
      gpsObrigatorio: false, multiplasParadas: false, capturaPeriodica: true,
    });
  });
});
