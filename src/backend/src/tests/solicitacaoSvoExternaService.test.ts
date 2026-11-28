import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/AppError';

const { trx, transaction } = vi.hoisted(() => {
  const trx: Record<string, unknown> = {};
  // O ponto de salvamento (transação aninhada) reaproveita o mesmo objeto de transação
  trx.transaction = vi.fn(async (callback: (conexao: unknown) => unknown) => callback(trx));
  return { trx, transaction: vi.fn(async (callback: (conexao: unknown) => unknown) => callback(trx)) };
});

vi.mock('../config/database', () => ({ db: { transaction } }));
vi.mock('../models/solicitacaoSvoExternaModel', () => ({
  solicitacaoSvoExternaModel: {
    bloquearTentativa: vi.fn(),
    inserirSolicitacao: vi.fn(),
    inserirDadosProtegidos: vi.fn(),
  },
}));
vi.mock('../models/acompanhamentoExternoSvoModel', () => ({
  acompanhamentoExternoSvoModel: { buscarTentativaPorChaveIdempotencia: vi.fn() },
}));
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { SOLICITACOES_SVO: 'SOLICITACOES_SVO' },
}));
vi.mock('../services/notificacaoSvoService', () => ({
  notificacaoSvoService: { publicarAlertasRegistroSolicitacao: vi.fn() },
}));
// O serviço da SCRUM-266 é o dono da credencial: aqui só se substituem emissão e recuperação
vi.mock('../services/acompanhamentoExternoSvoService', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('../services/acompanhamentoExternoSvoService')>();
  return {
    ...original,
    acompanhamentoExternoSvoService: {
      ...original.acompanhamentoExternoSvoService,
      emitirCredencialNaTransacao: vi.fn(),
      recuperarComprovanteTentativa: vi.fn(),
    },
  };
});

import { acompanhamentoExternoSvoModel } from '../models/acompanhamentoExternoSvoModel';
import { auditoriaModel } from '../models/auditoriaModel';
import { solicitacaoSvoExternaModel as modelo } from '../models/solicitacaoSvoExternaModel';
import {
  acompanhamentoExternoSvoService as servico266,
  calcularDigestProvaTentativa,
} from '../services/acompanhamentoExternoSvoService';
import { notificacaoSvoService } from '../services/notificacaoSvoService';
import { solicitacaoSvoExternaService as servico } from '../services/solicitacaoSvoExternaService';
import { solicitacaoSvoExternaSchema } from '../validators/solicitacaoSvoExternaSchemas';

// Dados sintéticos
const dados = solicitacaoSvoExternaSchema.parse({
  tipo_solicitante: 'PESSOA_FISICA',
  nome_solicitante: 'Nome Sentinela Sintetico',
  telefone_solicitante: '(79) 99999-0000',
  email_solicitante: 'sentinela@example.com',
  cpf_solicitante: '529.982.247-25',
  nome_falecido: 'Falecido Sintetico',
  local_ocorrencia: 'Rua Ficticia dos Testes',
  numero_imovel: '10',
  descricao_ocorrencia: 'Descricao sintetica da ocorrencia.',
  data_hora_ocorrencia: '2026-01-10T10:00:00-03:00',
  ciencia_aviso_privacidade: true,
  versao_aviso_privacidade: '2026-11-v1',
});
const tentativa = { chaveIdempotencia: 'tentativa-teste-0001', provaTentativa: 'P'.repeat(43) };
const EMITIDA = '2026-11-27T15:00:00.000Z';
const PROTOCOLO = 'SVO-20261127-ABCDEFGHJKLM';
const CREDENCIAL = 'C'.repeat(43);

const existente = (versao = 1) => ({
  solicitacao_id: 7,
  versao_credencial: versao,
  prova_tentativa_digest: calcularDigestProvaTentativa(tentativa.chaveIdempotencia, tentativa.provaTentativa, versao),
});

const nadaGravado = () => {
  expect(modelo.inserirSolicitacao).not.toHaveBeenCalled();
  expect(modelo.inserirDadosProtegidos).not.toHaveBeenCalled();
  expect(servico266.emitirCredencialNaTransacao).not.toHaveBeenCalled();
  expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia).mockResolvedValue(undefined);
  vi.mocked(modelo.inserirSolicitacao).mockResolvedValue(7);
  vi.mocked(servico266.emitirCredencialNaTransacao).mockImplementation(async (_trx, entrada) => ({
    solicitacaoId: entrada.solicitacaoId,
    protocolo: entrada.protocolo!,
    credencial: CREDENCIAL,
    emitidaEm: EMITIDA,
    recuperacaoExpiraEm: '2026-11-27T15:15:00.000Z',
  }));
  vi.mocked(servico266.recuperarComprovanteTentativa).mockResolvedValue({
    solicitacaoId: 7,
    protocolo: PROTOCOLO,
    credencial: CREDENCIAL,
    emitidaEm: EMITIDA,
    recuperacaoExpiraEm: '2026-11-27T15:15:00.000Z',
  });
});

describe('solicitacaoSvoExternaService.registrar (SCRUM-264)', () => {
  it('cria tudo na mesma transação e delega a credencial ao serviço da SCRUM-266', async () => {
    const resultado = await servico.registrar(dados, tentativa);

    expect(resultado.criada).toBe(true);
    expect(resultado.protocolo).toMatch(/^SVO-[0-9]{8}-[A-Z0-9]{12}$/);
    expect(resultado.credencial).toBe(CREDENCIAL);
    expect(resultado.registradaEm).toBe(EMITIDA);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(modelo.bloquearTentativa).toHaveBeenCalledWith(trx, tentativa.chaveIdempotencia);
    expect(modelo.inserirSolicitacao).toHaveBeenCalledWith(trx, resultado.protocolo, dados.local_ocorrencia);
    expect(modelo.inserirDadosProtegidos).toHaveBeenCalledWith(trx, 7, dados);
    expect(servico266.emitirCredencialNaTransacao).toHaveBeenCalledWith(trx, {
      solicitacaoId: 7,
      protocolo: resultado.protocolo,
      chaveIdempotencia: tentativa.chaveIdempotencia,
      payloadNormalizado: dados,
      provaTentativa: tentativa.provaTentativa,
      habilitarRecuperacao: true,
      agora: undefined,
    });
    expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).toHaveBeenCalledTimes(1);
    // S1 sem autor interno, na mesma transação
    expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).toHaveBeenCalledWith({ id: 7 }, null, trx);
  });

  it('auditoria sem usuário e sem dado pessoal', async () => {
    await servico.registrar(dados, tentativa);
    expect(auditoriaModel.registrar).toHaveBeenCalledTimes(1);
    const [registro, conexao] = vi.mocked(auditoriaModel.registrar).mock.calls[0]!;
    expect(registro.usuario_id).toBeNull();
    expect(registro.acao).toBe('CRIOU_SOLICITACAO_SVO_EXTERNA id=7');
    expect(JSON.stringify(registro)).not.toMatch(/Sentinela|529|example\.com/);
    expect(conexao).toBe(trx);
  });

  it('chave existente com prova correta recupera o mesmo resultado sem gravar de novo', async () => {
    vi.mocked(acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia).mockResolvedValue(existente() as never);
    const resultado = await servico.registrar(dados, tentativa);
    expect(resultado).toEqual({ criada: false, protocolo: PROTOCOLO, credencial: CREDENCIAL, registradaEm: EMITIDA });
    expect(servico266.recuperarComprovanteTentativa).toHaveBeenCalledWith(
      { chaveIdempotencia: tentativa.chaveIdempotencia, provaTentativa: tentativa.provaTentativa, payloadNormalizado: dados, agora: undefined },
      trx,
    );
    nadaGravado();
  });

  it('usa a versão criptográfica original da tentativa para conferir a prova (rotação de chaves)', async () => {
    vi.mocked(acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia).mockResolvedValue(existente(1) as never);
    await expect(servico.registrar(dados, tentativa)).resolves.toMatchObject({ criada: false });
  });

  it('prova errada recebe 401 uniforme, mesmo com conteúdo divergente: nada vaza sobre a chave', async () => {
    vi.mocked(acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia).mockResolvedValue(existente() as never);
    const outro = { ...dados, descricao_ocorrencia: 'Outra descricao sintetica.' };
    for (const caso of [
      servico.registrar(dados, { ...tentativa, provaTentativa: 'Q'.repeat(43) }),
      servico.registrar(outro, { ...tentativa, provaTentativa: 'Q'.repeat(43) }),
    ]) {
      const erro = await caso.catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(AppError);
      expect(erro).toMatchObject({ statusCode: 401, codigo: 'CREDENCIAL_EXTERNA_INVALIDA' });
    }
    expect(servico266.recuperarComprovanteTentativa).not.toHaveBeenCalled();
    nadaGravado();
  });

  it('tentativa sem prova gravada (chave de outra origem) recebe o mesmo 401', async () => {
    vi.mocked(acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia).mockResolvedValue({
      ...existente(),
      prova_tentativa_digest: null,
    } as never);
    await expect(servico.registrar(dados, tentativa)).rejects.toMatchObject({ statusCode: 401 });
    nadaGravado();
  });

  it('prova correta com conteúdo diferente: o 409 vem da SCRUM-266, só para quem provou a posse', async () => {
    vi.mocked(acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia).mockResolvedValue(existente() as never);
    vi.mocked(servico266.recuperarComprovanteTentativa).mockRejectedValueOnce(
      new AppError('Esta chave de tentativa já foi utilizada com dados diferentes.', 409, 'CONFLITO_IDEMPOTENCIA'),
    );
    await expect(servico.registrar({ ...dados, descricao_ocorrencia: 'Outra descricao sintetica.' }, tentativa)).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'CONFLITO_IDEMPOTENCIA',
    });
    nadaGravado();
  });

  it.each([
    ['janela expirada', new AppError('inválida', 401, 'CREDENCIAL_EXTERNA_INVALIDA')],
    ['credencial revogada', new AppError('inválida', 401, 'CREDENCIAL_EXTERNA_INVALIDA')],
  ])('%s não cria novo chamado e devolve 401 uniforme', async (_nome, falha) => {
    vi.mocked(acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia).mockResolvedValue(existente() as never);
    vi.mocked(servico266.recuperarComprovanteTentativa).mockRejectedValueOnce(falha);
    await expect(servico.registrar(dados, tentativa)).rejects.toMatchObject({ statusCode: 401, codigo: 'CREDENCIAL_EXTERNA_INVALIDA' });
    nadaGravado();
  });

  it('tenta de novo quando o protocolo colide e falha depois de 3 colisões', async () => {
    const colisao = Object.assign(new Error('duplicado'), { code: '23505' });
    vi.mocked(modelo.inserirSolicitacao).mockRejectedValueOnce(colisao).mockResolvedValueOnce(7);
    const resultado = await servico.registrar(dados, tentativa);
    expect(resultado.criada).toBe(true);
    expect(modelo.inserirSolicitacao).toHaveBeenCalledTimes(2);

    vi.mocked(modelo.inserirSolicitacao).mockReset().mockRejectedValue(colisao);
    await expect(servico.registrar(dados, tentativa)).rejects.toBe(colisao);
    expect(modelo.inserirSolicitacao).toHaveBeenCalledTimes(3);
  });

  describe('falhas dentro da transação (o rollback é do banco: nada é devolvido ao cidadão)', () => {
    it('falha na publicação do S1 propaga o erro e não devolve protocolo', async () => {
      vi.mocked(notificacaoSvoService.publicarAlertasRegistroSolicitacao).mockRejectedValueOnce(new Error('falha'));
      await expect(servico.registrar(dados, tentativa)).rejects.toThrow('falha');
    });

    it('falha ao emitir a credencial propaga o erro e não publica S1', async () => {
      vi.mocked(servico266.emitirCredencialNaTransacao).mockRejectedValueOnce(new Error('falha'));
      await expect(servico.registrar(dados, tentativa)).rejects.toThrow('falha');
      expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).not.toHaveBeenCalled();
    });
  });
});
