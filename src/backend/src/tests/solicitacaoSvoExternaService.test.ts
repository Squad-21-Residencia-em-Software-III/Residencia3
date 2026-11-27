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
    buscarCredencialPorChave: vi.fn(),
    inserirSolicitacao: vi.fn(),
    inserirDadosProtegidos: vi.fn(),
    inserirCredencial: vi.fn(),
  },
}));
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { SOLICITACOES_SVO: 'SOLICITACOES_SVO' },
}));
vi.mock('../services/notificacaoSvoService', () => ({
  notificacaoSvoService: { publicarAlertasRegistroSolicitacao: vi.fn() },
}));

import { auditoriaModel } from '../models/auditoriaModel';
import { solicitacaoSvoExternaModel as modelo } from '../models/solicitacaoSvoExternaModel';
import {
  calcularDigestCredencialExterna,
  calcularDigestPayloadCriacao,
  calcularDigestProvaTentativa,
  derivarCredencialExterna,
} from '../services/credencialExternaSvo';
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
const EMITIDA = new Date('2026-11-27T15:00:00.000Z');

const credencialEsperada = derivarCredencialExterna(tentativa.chaveIdempotencia, tentativa.provaTentativa);
const existenteValido = () => ({
  solicitacao_id: 7,
  protocolo: 'SVO-20261127-ABCDEFGHJKLM',
  segredo_digest: calcularDigestCredencialExterna(credencialEsperada),
  algoritmo_digest: 'HMAC-SHA-256',
  payload_criacao_digest: calcularDigestPayloadCriacao(dados),
  prova_tentativa_digest: calcularDigestProvaTentativa(tentativa.chaveIdempotencia, tentativa.provaTentativa),
  emitida_em: EMITIDA,
  revogada_em: null,
});

const nadaGravado = () => {
  expect(modelo.inserirSolicitacao).not.toHaveBeenCalled();
  expect(modelo.inserirDadosProtegidos).not.toHaveBeenCalled();
  expect(modelo.inserirCredencial).not.toHaveBeenCalled();
  expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(modelo.buscarCredencialPorChave).mockResolvedValue(undefined);
  vi.mocked(modelo.inserirSolicitacao).mockResolvedValue(7);
  vi.mocked(modelo.inserirCredencial).mockResolvedValue(EMITIDA);
});

describe('solicitacaoSvoExternaService.registrar (SCRUM-264)', () => {
  it('cria tudo na mesma transação e devolve protocolo e credencial', async () => {
    const resultado = await servico.registrar(dados, tentativa);

    expect(resultado.criada).toBe(true);
    expect(resultado.protocolo).toMatch(/^SVO-[0-9]{8}-[A-Z0-9]{12}$/);
    expect(resultado.credencial).toBe(credencialEsperada);
    expect(resultado.credencial).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(resultado.registradaEm).toBe(EMITIDA.toISOString());

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(modelo.bloquearTentativa).toHaveBeenCalledWith(trx, tentativa.chaveIdempotencia);
    expect(modelo.inserirSolicitacao).toHaveBeenCalledWith(trx, resultado.protocolo, dados.local_ocorrencia);
    expect(modelo.inserirDadosProtegidos).toHaveBeenCalledWith(trx, 7, dados);
    expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).toHaveBeenCalledTimes(1);
    // S1 sem autor interno, na mesma transação
    expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).toHaveBeenCalledWith({ id: 7 }, null, trx);
  });

  it('guarda só digests: nunca a credencial em texto claro', async () => {
    const resultado = await servico.registrar(dados, tentativa);
    const [, gravada] = vi.mocked(modelo.inserirCredencial).mock.calls[0]!;
    expect(gravada.segredoDigest).toBe(calcularDigestCredencialExterna(resultado.credencial));
    expect(gravada.algoritmoDigest).toBe('HMAC-SHA-256');
    expect(gravada.provaDigest).toBe(calcularDigestProvaTentativa(tentativa.chaveIdempotencia, tentativa.provaTentativa));
    expect(gravada.payloadDigest).toBe(calcularDigestPayloadCriacao(dados));
    expect(JSON.stringify(gravada)).not.toContain(resultado.credencial);
    expect(JSON.stringify(gravada)).not.toContain(tentativa.provaTentativa);
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

  it('repetição da mesma tentativa devolve o mesmo resultado sem gravar de novo', async () => {
    vi.mocked(modelo.buscarCredencialPorChave).mockResolvedValue(existenteValido());
    const resultado = await servico.registrar(dados, tentativa);
    expect(resultado).toEqual({
      criada: false,
      protocolo: 'SVO-20261127-ABCDEFGHJKLM',
      credencial: credencialEsperada,
      registradaEm: EMITIDA.toISOString(),
    });
    nadaGravado();
  });

  it('mesma chave com conteúdo diferente falha sem efeitos', async () => {
    vi.mocked(modelo.buscarCredencialPorChave).mockResolvedValue(existenteValido());
    const outro = { ...dados, descricao_ocorrencia: 'Outra descricao sintetica.' };
    await expect(servico.registrar(outro, tentativa)).rejects.toMatchObject({ statusCode: 409, codigo: 'IDEMPOTENCIA_CONFLITO' });
    nadaGravado();
  });

  it('mesma chave com prova diferente falha sem devolver credencial', async () => {
    vi.mocked(modelo.buscarCredencialPorChave).mockResolvedValue(existenteValido());
    const erro = await servico
      .registrar(dados, { ...tentativa, provaTentativa: 'Q'.repeat(43) })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(AppError);
    expect(erro).toMatchObject({ statusCode: 409, codigo: 'IDEMPOTENCIA_CONFLITO' });
    nadaGravado();
  });

  it('credencial revogada não é devolvida', async () => {
    vi.mocked(modelo.buscarCredencialPorChave).mockResolvedValue({ ...existenteValido(), revogada_em: new Date() });
    await expect(servico.registrar(dados, tentativa)).rejects.toMatchObject({ statusCode: 410 });
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

    it('falha ao gravar a credencial propaga o erro', async () => {
      vi.mocked(modelo.inserirCredencial).mockRejectedValueOnce(new Error('falha'));
      await expect(servico.registrar(dados, tentativa)).rejects.toThrow('falha');
      expect(notificacaoSvoService.publicarAlertasRegistroSolicitacao).not.toHaveBeenCalled();
    });
  });
});
