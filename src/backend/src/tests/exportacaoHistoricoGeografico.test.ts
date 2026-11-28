import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERFIS } from '../constants/perfis';
import { LIMITE_LINHAS_EXPORTACAO } from '../constants/relatorios';
import { consultarHistoricoGeografico } from '../services/consultaHistoricoGeografico';
import { exportarEvidenciasGeograficas } from '../services/exportacaoHistoricoGeografico';

const { trx, registrar } = vi.hoisted(() => ({ trx: {}, registrar: vi.fn() }));
vi.mock('../config/database', () => ({ db: { transaction: (fn: (conn: unknown) => unknown) => fn(trx) } }));
vi.mock('../models/auditoriaModel', () => ({ auditoriaModel: { registrar }, MODULOS_AUDITORIA: { RELATORIOS: 'RELATORIOS' } }));

const adm = { operacao: 'ADMINISTRATIVA', id: 11 };
const svo = { operacao: 'SVO', id: 11 };
const autor = { id: 7, perfil: PERFIS.GESTOR_FROTA };
const ponto = {
  tipo: 'CHECKPOINT' as const, marco: 'SAIDA' as const,
  capturadoEm: '2026-11-27T12:00:00Z', recebidoEm: '2026-11-27T12:00:10Z',
  coordenadas: { latitude: -10.123456, longitude: -37.987654 }, precisaoMetros: 20,
  descricao: '=campo-externo-reservado',
};

beforeEach(() => registrar.mockReset());

describe('exportação de histórico geográfico', () => {
  it('segrega operações, preserva precisão e audita metadados na mesma transação', async () => {
    const ler = vi.fn(async () => [ponto, { ...ponto, tipo: 'LACUNA' as const }]);
    const resultado = await exportarEvidenciasGeograficas(adm, autor, ler);
    expect(ler).toHaveBeenCalledWith(trx, autor, adm, LIMITE_LINHAS_EXPORTACAO + 1);
    const csv = resultado.conteudo.toString('utf8');
    expect(csv).toContain('-10,123456;-37,987654');
    expect(csv).not.toContain('campo-externo-reservado');
    expect(csv.split('\r\n').find((linha) => linha.startsWith('LACUNA;'))).not.toContain('-10,123456');
    expect(registrar).toHaveBeenCalledOnce();
    expect(registrar).toHaveBeenCalledWith({
      usuario_id: 7, modulo: 'RELATORIOS', acao: 'EXPORTOU_HISTORICO_GEOGRAFICO operacao=ADMINISTRATIVA registro=11 linhas=2',
    }, trx);
    await expect(exportarEvidenciasGeograficas(svo, autor, ler)).rejects.toMatchObject({ statusCode: 403 });
    expect(ler).toHaveBeenCalledOnce();
  });
  it('rejeita registros revogados e perfis sem permissão de exportação', async () => {
    const ler = vi.fn(async () => undefined);
    await expect(exportarEvidenciasGeograficas(adm, autor, ler)).rejects.toMatchObject({ statusCode: 404 });
    for (const perfil of [PERFIS.SOLICITANTE, PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO, PERFIS.INTEGRANTE_SVO]) {
      await expect(exportarEvidenciasGeograficas(adm, { ...autor, perfil }, ler)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(ler).toHaveBeenCalledOnce();
    expect(registrar).not.toHaveBeenCalled();
  });
  it('limita o conjunto e só retorna arquivo quando a auditoria termina', async () => {
    await expect(exportarEvidenciasGeograficas(adm, autor, async () =>
      Array.from({ length: LIMITE_LINHAS_EXPORTACAO + 1 }, () => ponto),
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(registrar).not.toHaveBeenCalled();
    registrar.mockRejectedValueOnce(new Error('falha sintética'));
    await expect(exportarEvidenciasGeograficas(adm, autor, async () => [ponto])).rejects.toThrow('falha sintética');
  });
});

it('projeta histórico paginado e mantém evidência descartada fora da resposta', async () => {
  const motorista = { id: 7, perfil: PERFIS.MOTORISTA_FROTA };
  const ler = vi.fn(async () => ({
    roteiroOriginal: { versao: 1, metodo: 'HAVERSINE_APROXIMADO' as const, distanciaMetros: 2500, geometriaPlanejada: 'incoerente' },
    alteracoes: [], versaoUtilizada: 1, estadoEvidencias: 'DESCARTADO' as const, evidencias: [ponto],
    proximoCursor: 'abc', dadoReservado: ponto.descricao,
  }));
  const resultado = await consultarHistoricoGeografico(adm, motorista, ler);
  expect(ler).toHaveBeenCalledWith(trx, motorista, { ...adm, limite: 20 });
  expect(resultado).toMatchObject({ ...adm, evidencias: [], proximoCursor: null, roteiroOriginal: { geometriaPlanejada: null } });
  expect(resultado).not.toHaveProperty('dadoReservado');
  await expect(consultarHistoricoGeografico(svo, motorista, ler)).rejects.toMatchObject({ statusCode: 403 });
  expect(ler).toHaveBeenCalledOnce();
});
