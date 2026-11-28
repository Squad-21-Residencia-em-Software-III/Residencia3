import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PERFIS, type Perfil } from '../constants/perfis';
import { carregarEnv, env } from '../config/env';
import { carregarRecursosOperacionais } from '../config/recursosOperacionais';

const { trx, transaction, buscarSolicitacaoTxMock, atualizarSolicitacaoTxMock } =
  vi.hoisted(() => {
    const buscarSolicitacaoTxMock = vi.fn();
    const atualizarSolicitacaoTxMock = vi.fn(async () => 1);
    const tabelaMock = vi.fn(() => ({
      where: vi.fn(() => ({
        forUpdate: vi.fn(() => ({
          first: buscarSolicitacaoTxMock,
        })),
        update: atualizarSolicitacaoTxMock,
      })),
    }));
    const trx = Object.assign(tabelaMock, { isTransaction: true });
    return {
      trx,
      buscarSolicitacaoTxMock,
      atualizarSolicitacaoTxMock,
      transaction: vi.fn(async (callback: (conn: unknown) => unknown) =>
        callback(trx)
      ),
    };
  });

vi.mock('../models/unidadeModel', async (importOriginal) => {
  const original = await importOriginal<typeof import('../models/unidadeModel')>();
  return {
    ...original,
    unidadeModel: {
      ...original.unidadeModel,
      estaAssociadoPorNome: vi.fn(async () => true),
    },
  };
});

vi.mock('../config/database', () => ({ db: { transaction } }));
vi.mock('../services/authService', () => ({
  authService: { usuarioDoToken: vi.fn() },
}));
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { SOLICITACOES_SVO: 'SOLICITACOES_SVO' },
}));
vi.mock('../models/acompanhamentoExternoSvoModel', () => ({
  acompanhamentoExternoSvoModel: {
    inserirCredencial: vi.fn(),
    inserirRecuperacaoTentativa: vi.fn(),
    buscarPorProtocolo: vi.fn(),
    buscarTentativaPorChaveIdempotencia: vi.fn(),
    registrarAcessoValidoSeAutorizado: vi.fn(),
    registrarInicioAnalise: vi.fn(),
    registrarEncerramentoOperacional: vi.fn(),
    revogarCredencial: vi.fn(),
  },
}));

import { app } from '../app';
import { auditoriaModel } from '../models/auditoriaModel';
import {
  acompanhamentoExternoSvoModel,
  type RegistroAcompanhamentoExternoRow,
} from '../models/acompanhamentoExternoSvoModel';
import { authService } from '../services/authService';
import { solicitacaoSvoExternaSchema } from '../validators/solicitacaoSvoExternaSchemas';
import {
  JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS,
  MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
  acompanhamentoExternoSvoService,
  calcularDigestCredencialExterna,
  calcularDigestPayloadCriacao,
  calcularDigestProvaTentativa,
  cifrarEnvelopeRecuperacao,
  gerarProtocoloExternoSvo,
  gerarSegredoCredencialExterna,
  mapearStatusPublicoAcompanhamentoSvo,
} from '../services/acompanhamentoExternoSvoService';

const PROTOCOLO_VALIDO_A = 'SVO-20261127-9F8E7D6C5B4A';
const PROTOCOLO_VALIDO_B = 'SVO-20261127-2B3C4D5E6F7G';
const CREDENCIAL_A = 'credencial_secreta_de_alta_entropia_chamado_A_012345';
const CREDENCIAL_B = 'credencial_secreta_de_alta_entropia_chamado_B_678901';

const recursosOriginais = env.recursosOperacionais;
const chavesOriginais = env.credencialExternaSvo;

function criarRegistroBase(
  overrides: Partial<RegistroAcompanhamentoExternoRow> = {}
): RegistroAcompanhamentoExternoRow {
  const digestA = calcularDigestCredencialExterna(CREDENCIAL_A, 'HMAC-SHA-256');
  return {
    solicitacao_id: 101,
    canal_origem: 'EXTERNA',
    protocolo: PROTOCOLO_VALIDO_A,
    status_solicitacao: 'EM_TRIAGEM',
    criado_em: new Date('2026-11-27T10:00:00.000Z'),
    confirmado_em: null,
    analise_iniciada_em: null,
    motivo_recusa_publico: null,
    cancelamento_status: null,
    cancelamento_solicitado_em: null,
    cancelamento_decidido_em: null,
    cancelamento_mensagem_publica: null,
    versao_dados: 1,
    encerrado_operacional_em: null,
    consulta_publica_expira_em: null,
    atualizado_em_dados: new Date('2026-11-27T10:00:00.000Z'),
    segredo_digest: digestA,
    algoritmo_digest: 'HMAC-SHA-256',
    versao_credencial: 1,
    emitida_em: new Date('2026-11-27T10:00:00.000Z'),
    revogada_em: null,
    ordem_status: null,
    ordem_saida_em: null,
    ordem_conclusao_em: null,
    ...overrides,
  };
}

describe('SCRUM-266 — Credenciais e API segura de acompanhamento externo SVO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.recursosOperacionais = carregarRecursosOperacionais({
      ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true',
      PORTAL_SVO_ATIVO: 'true',
    });
    env.credencialExternaSvo = chavesOriginais;
    transaction.mockImplementation(async (cb) => cb(trx));
    buscarSolicitacaoTxMock.mockResolvedValue({
      id: 101,
      canal_origem: 'EXTERNA',
      protocolo: PROTOCOLO_VALIDO_A,
    });
    vi.mocked(acompanhamentoExternoSvoModel.inserirCredencial).mockResolvedValue({
      solicitacao_id: 101, algoritmo_digest: 'HMAC-SHA-256', versao_credencial: 1,
      emitida_em: new Date('2026-11-27T12:00:00.000Z'),
    });
    vi.mocked(
      acompanhamentoExternoSvoModel.registrarAcessoValidoSeAutorizado
    ).mockResolvedValue(true);
  });

  afterEach(() => {
    env.recursosOperacionais = recursosOriginais;
    env.credencialExternaSvo = chavesOriginais;
  });

  describe('1. Emissão consistente, chaves dedicadas com rotação e recuperação autenticada após commit', () => {
    it('gera protocolo público distinto do segredo de alta entropia, grava envelope cifrado separado e nunca salva segredo em claro', async () => {
      const protocolo = gerarProtocoloExternoSvo(
        new Date('2026-11-27T12:00:00.000Z')
      );
      const segredo = gerarSegredoCredencialExterna();

      expect(protocolo).toMatch(/^SVO-20261127-[A-Z0-9]{12}$/);
      expect(segredo).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(segredo).not.toBe(protocolo);

      buscarSolicitacaoTxMock.mockResolvedValueOnce({
        id: 101,
        canal_origem: 'EXTERNA',
        protocolo,
      });

      const chaveIdempotencia = 'tentativa-svo-20261127-001';
      const provaTentativa = gerarSegredoCredencialExterna();
      const payload = {
        nome_solicitante: 'Cidadão Sintético',
        cpf_solicitante: '52998224725',
        local_ocorrencia: 'Rua A, 100 - Aracaju/SE',
      };

      const emitido =
        await acompanhamentoExternoSvoService.emitirCredencialNaTransacao(
          trx as never,
          {
            solicitacaoId: 101,
            protocolo,
            chaveIdempotencia,
            provaTentativa,
            habilitarRecuperacao: true,
            payloadNormalizado: payload,
            agora: new Date('2026-11-27T12:00:00.000Z'),
          }
        );

      expect(emitido.protocolo).toBe(protocolo);
      expect(emitido.credencial).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(emitido.recuperacaoExpiraEm).toEqual(expect.any(String));
      expect(acompanhamentoExternoSvoModel.inserirCredencial).toHaveBeenCalledTimes(1);
      expect(
        acompanhamentoExternoSvoModel.inserirRecuperacaoTentativa
      ).toHaveBeenCalledTimes(1);

      const credencialGravada = vi.mocked(
        acompanhamentoExternoSvoModel.inserirCredencial
      ).mock.calls[0]?.[0];
      const recuperacaoGravada = vi.mocked(
        acompanhamentoExternoSvoModel.inserirRecuperacaoTentativa
      ).mock.calls[0]?.[0];

      expect(credencialGravada?.solicitacao_id).toBe(101);
      expect(credencialGravada?.segredo_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(credencialGravada?.segredo_digest).not.toContain(emitido.credencial);
      expect(credencialGravada?.payload_criacao_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(recuperacaoGravada?.envelope_cifrado).not.toContain(emitido.credencial);
      expect(recuperacaoGravada?.versao_chave).toBe(env.credencialExternaSvo.versaoAtual);
      expect(atualizarSolicitacaoTxMock).not.toHaveBeenCalled();
    });

    it('valida consistência de canal, protocolo registrado, chave e prova obrigatória na emissão', async () => {
      // 1. Canal INTERNA bloqueado
      buscarSolicitacaoTxMock.mockResolvedValueOnce({
        id: 202,
        canal_origem: 'INTERNA',
        protocolo: null,
      });
      await expect(
        acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx as never, {
          solicitacaoId: 202,
          chaveIdempotencia: 'idem-canal-interno-01',
          payloadNormalizado: { local_ocorrencia: 'Rua B' },
        })
      ).rejects.toMatchObject({ statusCode: 409, codigo: 'CANAL_INCOMPATIVEL' });

      // 2. Protocolo divergente do persistido no banco -> 409
      buscarSolicitacaoTxMock.mockResolvedValueOnce({
        id: 101,
        canal_origem: 'EXTERNA',
        protocolo: PROTOCOLO_VALIDO_A,
      });
      await expect(
        acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx as never, {
          solicitacaoId: 101,
          protocolo: PROTOCOLO_VALIDO_B,
          chaveIdempotencia: 'idem-proto-div-01',
          payloadNormalizado: { local_ocorrencia: 'Rua A' },
        })
      ).rejects.toMatchObject({ statusCode: 409, codigo: 'PROTOCOLO_DIVERGENTE' });

      // 3. habilitarRecuperacao sem prova de posse valida -> 400
      await expect(
        acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx as never, {
          solicitacaoId: 101,
          protocolo: PROTOCOLO_VALIDO_A,
          chaveIdempotencia: 'idem-sem-prova-01',
          habilitarRecuperacao: true,
          provaTentativa: null,
          payloadNormalizado: { local_ocorrencia: 'Rua A' },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('recupera protocolo e credencial via POST /recuperar-comprovante e rejeita payload divergente, prova inválida, revogada ou expirada', async () => {
      const chaveIdempotencia = 'tentativa-svo-20261127-replay-01';
      const provaCorreta = gerarSegredoCredencialExterna();
      const provaImpostor = gerarSegredoCredencialExterna();
      const payloadOriginal = {
        tipo_solicitante: 'PESSOA_FISICA',
        nome_solicitante: 'Hospital Sintético',
        telefone_solicitante: '(79) 99999-0000',
        email_solicitante: 'sintetico@example.invalid',
        cpf_solicitante: '529.982.247-25',
        nome_falecido: 'Falecido Sintético',
        local_ocorrencia: 'Av. Beira Mar, 1500',
        numero_imovel: '1500',
        descricao_ocorrencia: 'Descrição sintética da ocorrência.',
        data_hora_ocorrencia: '2026-01-10T10:00:00-03:00',
        ciencia_aviso_privacidade: true,
        versao_aviso_privacidade: '2026-11-v1',
      };
      const payloadAdulterado = { ...payloadOriginal, local_ocorrencia: 'Rua Diferente, 999' };

      const payloadDigest = calcularDigestPayloadCriacao(solicitacaoSvoExternaSchema.parse(payloadOriginal));
      const provaDigest = calcularDigestProvaTentativa(
        chaveIdempotencia,
        provaCorreta
      );
      const envelope = cifrarEnvelopeRecuperacao({
        credencial: CREDENCIAL_A,
        protocolo: PROTOCOLO_VALIDO_A,
        chaveIdempotencia,
        provaTentativa: provaCorreta,
        payloadDigest,
      });

      const tentativaValida = {
        solicitacao_id: 101,
        protocolo: PROTOCOLO_VALIDO_A,
        canal_origem: 'EXTERNA' as const,
        status_solicitacao: 'EM_TRIAGEM' as const,
        segredo_digest: calcularDigestCredencialExterna(
          CREDENCIAL_A,
          'HMAC-SHA-256'
        ),
        algoritmo_digest: 'HMAC-SHA-256' as const,
        versao_credencial: 1,
        chave_idempotencia_criacao: chaveIdempotencia,
        payload_criacao_digest: payloadDigest,
        prova_tentativa_digest: provaDigest,
        emitida_em: new Date('2026-11-27T12:00:00.000Z'),
        revogada_em: null,
        envelope_cifrado: envelope,
        versao_chave: 1,
        recuperacao_expira_em: new Date(Date.now() + 10 * 60 * 1000),
        recuperacao_descartada_em: null,
        verificada_em: new Date(),
      };

      vi.mocked(
        acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia
      ).mockResolvedValue(tentativaValida);

      // 1. Replay autenticado pelo dono da tentativa
      const respOk = await request(app)
        .post('/api/solicitacoes-svo/externas/recuperar-comprovante')
        .set('Idempotency-Key', chaveIdempotencia)
        .set('X-Prova-Tentativa', provaCorreta)
        .send({ payload: payloadOriginal });

      expect(respOk.status).toBe(200);
      expect(respOk.headers['cache-control']).toContain('no-store');
      expect(respOk.body).toEqual({
        protocolo: PROTOCOLO_VALIDO_A,
        credencial: CREDENCIAL_A,
        emitida_em: '2026-11-27T12:00:00.000Z',
        recuperacao_expira_em: expect.any(String),
      });

      // 2. Mesma chave com payload divergente -> 409 CONFLITO_IDEMPOTENCIA sem expor segredo
      const respConflito = await request(app)
        .post('/api/solicitacoes-svo/externas/recuperar-comprovante')
        .set('Idempotency-Key', chaveIdempotencia)
        .set('X-Prova-Tentativa', provaCorreta)
        .send({ payload: payloadAdulterado });

      expect(respConflito.status).toBe(409);
      expect(respConflito.body.codigo).toBe('CONFLITO_IDEMPOTENCIA');
      expect(respConflito.body.credencial).toBeUndefined();

      // 3. Prova incorreta (apenas chave + payload conhecidos) -> 401 uniforme
      const respImpostor = await request(app)
        .post('/api/solicitacoes-svo/externas/recuperar-comprovante')
        .set('Idempotency-Key', chaveIdempotencia)
        .set('X-Prova-Tentativa', provaImpostor)
        .send({ payload: payloadAdulterado });

      expect(respImpostor.status).toBe(401);
      expect(respImpostor.body.erro).toBe(MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA);
      expect(respImpostor.body.codigo).toBe('CREDENCIAL_EXTERNA_INVALIDA');
      expect(respImpostor.body.credencial).toBeUndefined();

      // 4. Janela expirada -> 401 uniforme
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia
      ).mockResolvedValueOnce({
        ...tentativaValida,
        recuperacao_expira_em: new Date(Date.now() - 1000),
      });
      const respExpirada = await request(app)
        .post('/api/solicitacoes-svo/externas/recuperar-comprovante')
        .set('Idempotency-Key', chaveIdempotencia)
        .set('X-Prova-Tentativa', provaCorreta)
        .send({ payload: payloadOriginal });
      expect(respExpirada.status).toBe(401);
    });

    it('usa chave dedicada desacoplada de JWT_SECRET, exige segredo em produção e suporta rotação de versões', async () => {
      const envSemSegredoProd = () =>
        carregarEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'segredo_jwt_producao_muito_forte_e_aleatorio_32chars',
          CORS_ORIGIN: 'https://fsph.exemplo.gov.br',
          TRUST_PROXY: '1',
          ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true',
        });
      expect(envSemSegredoProd).toThrow(/CREDENCIAL_EXTERNA_SVO_SECRET/);

      const envProdValido = carregarEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'segredo_jwt_producao_muito_forte_e_aleatorio_32chars',
        CREDENCIAL_EXTERNA_SVO_SECRET: 'chave_dedicada_svo_versao_2_producao_muito_forte',
        CREDENCIAL_EXTERNA_SVO_KEY_VERSION: '2',
        CREDENCIAL_EXTERNA_SVO_PREVIOUS_SECRETS:
          '1:chave_dedicada_svo_versao_1_anterior_muito_forte',
        CORS_ORIGIN: 'https://fsph.exemplo.gov.br',
        TRUST_PROXY: '1',
        ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true',
      });

      env.credencialExternaSvo = envProdValido.credencialExternaSvo;
      const digestV1 = calcularDigestCredencialExterna(
        CREDENCIAL_A,
        'HMAC-SHA-256',
        1
      );
      const digestV2 = calcularDigestCredencialExterna(
        CREDENCIAL_A,
        'HMAC-SHA-256',
        2
      );
      expect(digestV1).not.toBe(digestV2);

      // Credencial antiga v1 continua autenticando apos rotacao para v2
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(
        criarRegistroBase({
          versao_credencial: 1,
          segredo_digest: digestV1,
        })
      );

      const respV1 = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({ protocolo: PROTOCOLO_VALIDO_A, credencial: CREDENCIAL_A });
      expect(respV1.status).toBe(200);
    });
  });

  describe('2. Os 7 estados públicos, semântica real e proteção contra vazamento de justificativas internas', () => {
    it.each([
      {
        cenario: 'Recebida (EM_TRIAGEM sem analise_iniciada_em mesmo com edicao cadastral)',
        overrides: {
          status_solicitacao: 'EM_TRIAGEM' as const,
          analise_iniciada_em: null,
          versao_dados: 2,
          cancelamento_status: null,
        },
        esperadoStatus: 'RECEBIDA',
        esperadoLabel: 'Recebida',
        permiteEditar: true,
        permiteCancelar: true,
      },
      {
        cenario: 'Em análise (EM_TRIAGEM com analise_iniciada_em verificavel)',
        overrides: {
          status_solicitacao: 'EM_TRIAGEM' as const,
          analise_iniciada_em: new Date('2026-11-27T10:15:00.000Z'),
          versao_dados: 1,
          cancelamento_status: null,
        },
        esperadoStatus: 'EM_ANALISE',
        esperadoLabel: 'Em análise',
        permiteEditar: true,
        permiteCancelar: true,
      },
      {
        cenario: 'Confirmada após alocação real, antes da saída',
        overrides: {
          status_solicitacao: 'EM_ANDAMENTO' as const,
          analise_iniciada_em: new Date('2026-11-27T10:15:00.000Z'),
          confirmado_em: new Date('2026-11-27T11:00:00.000Z'),
          ordem_status: 'ALOCADA' as const,
        },
        esperadoStatus: 'CONFIRMADA',
        esperadoLabel: 'Confirmada',
        permiteEditar: false,
        permiteCancelar: true,
      },
      {
        cenario: 'Em andamento (somente quando ordem em deslocamento ou no local)',
        overrides: {
          status_solicitacao: 'EM_ANDAMENTO' as const,
          analise_iniciada_em: new Date('2026-11-27T10:15:00.000Z'),
          confirmado_em: new Date('2026-11-27T11:00:00.000Z'),
          ordem_status: 'EM_DESLOCAMENTO' as const,
          ordem_saida_em: new Date('2026-11-27T11:30:00.000Z'),
        },
        esperadoStatus: 'EM_ANDAMENTO',
        esperadoLabel: 'Em andamento',
        permiteEditar: false,
        permiteCancelar: true,
      },
      {
        cenario: 'Concluída',
        overrides: {
          status_solicitacao: 'CONCLUIDA' as const,
          ordem_status: 'CONCLUIDA' as const,
          ordem_conclusao_em: new Date('2026-11-27T13:00:00.000Z'),
          encerrado_operacional_em: new Date('2026-11-27T13:00:00.000Z'),
          consulta_publica_expira_em: new Date('2026-12-27T13:00:00.000Z'),
        },
        esperadoStatus: 'CONCLUIDA',
        esperadoLabel: 'Concluída',
        permiteEditar: false,
        permiteCancelar: false,
      },
      {
        cenario: 'Não acolhida (exibe motivo_recusa_publico, nunca motivo_recusa interno)',
        overrides: {
          status_solicitacao: 'RECUSADA' as const,
          motivo_recusa_publico:
            'Caso com indício de causa externa encaminhado ao IML.',
          encerrado_operacional_em: new Date('2026-11-27T11:20:00.000Z'),
          consulta_publica_expira_em: new Date('2026-12-27T11:20:00.000Z'),
        },
        esperadoStatus: 'NAO_ACOLHIDA',
        esperadoLabel: 'Não acolhida',
        permiteEditar: false,
        permiteCancelar: false,
      },
      {
        cenario: 'Cancelada (usa exclusivamente cancelamento_mensagem_publica)',
        overrides: {
          status_solicitacao: 'CANCELADA' as const,
          cancelamento_status: 'ACEITO' as const,
          cancelamento_decidido_em: new Date('2026-11-27T11:45:00.000Z'),
          cancelamento_mensagem_publica:
            'Cancelamento confirmado a pedido do solicitante antes da saída.',
          encerrado_operacional_em: new Date('2026-11-27T11:45:00.000Z'),
          consulta_publica_expira_em: new Date('2026-12-27T11:45:00.000Z'),
        },
        esperadoStatus: 'CANCELADA',
        esperadoLabel: 'Cancelada',
        permiteEditar: false,
        permiteCancelar: false,
      },
    ])(
      'mapeia e retorna corretamente o estado público: $cenario',
      async ({
        overrides,
        esperadoStatus,
        esperadoLabel,
        permiteEditar,
        permiteCancelar,
      }) => {
        vi.mocked(
          acompanhamentoExternoSvoModel.buscarPorProtocolo
        ).mockResolvedValueOnce(criarRegistroBase(overrides));

        const resposta = await request(app)
          .post('/api/solicitacoes-svo/externas/acompanhamento')
          .send({
            protocolo: PROTOCOLO_VALIDO_A,
            credencial: CREDENCIAL_A,
          });

        expect(resposta.status).toBe(200);
        expect(resposta.headers['cache-control']).toBe(
          'no-store, no-cache, must-revalidate, private, max-age=0'
        );
        expect(resposta.body.protocolo).toBe(PROTOCOLO_VALIDO_A);
        expect(resposta.body.status).toBe(esperadoStatus);
        expect(resposta.body.status_label).toBe(esperadoLabel);
        expect(resposta.body.permite_editar_contato_local).toBe(permiteEditar);
        expect(resposta.body.permite_solicitar_cancelamento).toBe(
          permiteCancelar
        );

        const chavesRetornadas = Object.keys(resposta.body).sort();
        expect(chavesRetornadas).toEqual(
          [
            'atualizada_em',
            'cancelamento',
            'consulta_disponivel_ate',
            'encerrada_em',
            'mensagem_publica',
            'permite_editar_contato_local',
            'permite_solicitar_cancelamento',
            'protocolo',
            'registrada_em',
            'status',
            'status_label',
            'versao_dados',
          ].sort()
        );
        expect(JSON.stringify(resposta.body)).not.toMatch(
          /motorista|veiculo|placa|equipe|latitude|longitude|cpf|falecido|motivo_recusa|cancelamento_justificativa_decisao/i
        );
      }
    );

    it('nunca expõe justificativa interna nem fabrica datas de encerramento; calcula atualizada_em como a maior data válida', async () => {
      const maisRecente = new Date('2026-11-27T16:40:00.000Z');
      const registroComHistorico = criarRegistroBase({
        status_solicitacao: 'CANCELADA',
        confirmado_em: new Date('2026-11-27T11:00:00.000Z'),
        ordem_saida_em: new Date('2026-11-27T11:30:00.000Z'),
        cancelamento_status: 'ACEITO',
        cancelamento_solicitado_em: new Date('2026-11-27T12:00:00.000Z'),
        cancelamento_decidido_em: new Date('2026-11-27T12:15:00.000Z'),
        // Simula campo extra interno eventualmente presente em mock, nunca lido pelo DTO:
        ...({ cancelamento_justificativa_decisao: 'DADO_INTERNO_CONFIDENCIAL_CPF_000' } as Record<string, unknown>),
        cancelamento_mensagem_publica: null,
        encerrado_operacional_em: null,
        consulta_publica_expira_em: null,
        atualizado_em_dados: maisRecente,
      });

      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(registroComHistorico);

      const resposta = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({ protocolo: PROTOCOLO_VALIDO_A, credencial: CREDENCIAL_A });

      expect(resposta.status).toBe(401);
      expect(resposta.body.codigo).toBe('CREDENCIAL_EXTERNA_INVALIDA');

      vi.mocked(acompanhamentoExternoSvoModel.buscarPorProtocolo).mockResolvedValueOnce({
        ...registroComHistorico, status_solicitacao: 'CONFIRMADA',
      });
      const aberta = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({ protocolo: PROTOCOLO_VALIDO_A, credencial: CREDENCIAL_A });
      expect(aberta.status).toBe(200);
      expect(aberta.body.atualizada_em).toBe(maisRecente.toISOString());
      expect(aberta.body.encerrada_em).toBeNull();
      expect(aberta.body.consulta_disponivel_ate).toBeNull();
      expect(aberta.body.cancelamento.mensagem_decisao).toBeNull();
      expect(JSON.stringify(aberta.body)).not.toContain(
        'DADO_INTERNO_CONFIDENCIAL_CPF_000'
      );
    });

    it('também permite consulta via GET /acompanhamento/:protocolo com credencial exclusivamente no header X-Credencial-Acompanhamento', async () => {
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(criarRegistroBase());

      const resposta = await request(app)
        .get(
          `/api/solicitacoes-svo/externas/acompanhamento/${PROTOCOLO_VALIDO_A}`
        )
        .set('X-Credencial-Acompanhamento', CREDENCIAL_A);

      expect(resposta.status).toBe(200);
      expect(resposta.body.protocolo).toBe(PROTOCOLO_VALIDO_A);
      expect(resposta.body.status).toBe('RECEBIDA');
    });
  });

  describe('3. Segurança de transporte, janela de 30 dias, concorrência e independência de flags', () => {
    it('rejeita protocolo isolado, credencial incorreta e combinação cruzada com 401 uniforme e proíbe parâmetros na URL', async () => {
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockImplementation(async (protocolo) => {
        if (protocolo === PROTOCOLO_VALIDO_A) {
          return criarRegistroBase();
        }
        if (protocolo === PROTOCOLO_VALIDO_B) {
          return criarRegistroBase({
            solicitacao_id: 102,
            protocolo: PROTOCOLO_VALIDO_B,
            segredo_digest: calcularDigestCredencialExterna(
              CREDENCIAL_B,
              'HMAC-SHA-256'
            ),
          });
        }
        return undefined;
      });

      const semCredencial = await request(app).get(
        `/api/solicitacoes-svo/externas/acompanhamento/${PROTOCOLO_VALIDO_A}`
      );
      const cruzada = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({ protocolo: PROTOCOLO_VALIDO_A, credencial: CREDENCIAL_B });
      const inexistente = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({
          protocolo: 'SVO-20261127-999999999999',
          credencial: CREDENCIAL_A,
        });

      for (const resp of [semCredencial, cruzada, inexistente]) {
        expect(resp.status).toBe(401);
        expect(resp.body.codigo).toBe('CREDENCIAL_EXTERNA_INVALIDA');
      }

      const naQueryGet = await request(app).get(
        `/api/solicitacoes-svo/externas/acompanhamento/${PROTOCOLO_VALIDO_A}?credencial=${CREDENCIAL_A}`
      );
      expect(naQueryGet.status).toBe(400);
      expect(naQueryGet.body.codigo).toBe('CREDENCIAIS_NA_URL_PROIBIDAS');
    });

    it('respeita limite exato de 30 dias via consulta_publica_expira_em e nega acesso quando atualização concorrente detecta revogação', async () => {
      const encerradoEm = new Date('2026-10-01T12:00:00.000Z');
      const limiteExato30Dias = new Date(
        encerradoEm.getTime() + JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS
      );
      const apos30Dias = new Date(limiteExato30Dias.getTime() + 1);

      const registroEncerrado = criarRegistroBase({
        status_solicitacao: 'CONCLUIDA',
        ordem_status: 'CONCLUIDA',
        encerrado_operacional_em: encerradoEm,
        consulta_publica_expira_em: limiteExato30Dias,
      });

      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(registroEncerrado);
      const noLimite =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          PROTOCOLO_VALIDO_A,
          CREDENCIAL_A,
          { agora: new Date(limiteExato30Dias.getTime() - 1) }
        );
      expect(noLimite.status).toBe('CONCLUIDA');

      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(registroEncerrado);
      await expect(
        acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          PROTOCOLO_VALIDO_A,
          CREDENCIAL_A,
          { agora: apos30Dias }
        )
      ).rejects.toMatchObject({ statusCode: 401 });

      // Simula revogação ou expiração ocorrida entre o SELECT inicial e o UPDATE atômico de acesso
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(registroEncerrado);
      vi.mocked(
        acompanhamentoExternoSvoModel.registrarAcessoValidoSeAutorizado
      ).mockResolvedValueOnce(false);
      await expect(
        acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          PROTOCOLO_VALIDO_A,
          CREDENCIAL_A,
          { agora: new Date(limiteExato30Dias.getTime() - 1) }
        )
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('mantém independência estrita entre flags portalSvo e acompanhamentoExterno', async () => {
      // Acompanhamento desligado, portal ligado: consulta retorna 404 RECURSO_DESATIVADO, recuperacao funciona
      env.recursosOperacionais = carregarRecursosOperacionais({
        PORTAL_SVO_ATIVO: 'true',
        ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'false',
      });
      const respConsultaDesligada = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({ protocolo: PROTOCOLO_VALIDO_A, credencial: CREDENCIAL_A });
      expect(respConsultaDesligada.status).toBe(404);
      expect(respConsultaDesligada.body.codigo).toBe('RECURSO_DESATIVADO');

      vi.mocked(
        acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia
      ).mockResolvedValueOnce(undefined);
      const respRecComPortalLigado = await request(app)
        .post('/api/solicitacoes-svo/externas/recuperar-comprovante')
        .set('Idempotency-Key', 'idem-flag-indep-01')
        .set('X-Prova-Tentativa', gerarSegredoCredencialExterna())
        .send({ payload: {
        tipo_solicitante: 'PESSOA_FISICA',
        nome_solicitante: 'Hospital Sintético',
        telefone_solicitante: '(79) 99999-0000',
        email_solicitante: 'sintetico@example.invalid',
        cpf_solicitante: '529.982.247-25',
        nome_falecido: 'Falecido Sintético',
        local_ocorrencia: 'Av. Beira Mar, 1500',
        numero_imovel: '1500',
        descricao_ocorrencia: 'Descrição sintética da ocorrência.',
        data_hora_ocorrencia: '2026-01-10T10:00:00-03:00',
        ciencia_aviso_privacidade: true,
        versao_aviso_privacidade: '2026-11-v1',
      } });
      expect(respRecComPortalLigado.status).toBe(401);

      // Acompanhamento ligado, portal desligado: consulta funciona normalmente
      env.recursosOperacionais = carregarRecursosOperacionais({
        PORTAL_SVO_ATIVO: 'false',
        ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true',
      });
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(criarRegistroBase());
      const respConsultaLigada = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({ protocolo: PROTOCOLO_VALIDO_A, credencial: CREDENCIAL_A });
      expect(respConsultaLigada.status).toBe(200);
    });

    it('permite revogação auditada apenas por GESTOR_SVO associado ou ADMINISTRADOR e nega para motorista', async () => {
      const autenticarComo = (perfil: Perfil, id = 4) =>
        vi.mocked(authService.usuarioDoToken).mockResolvedValue({
          id,
          perfil,
        } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

      autenticarComo(PERFIS.GESTOR_SVO, 4);
      vi.mocked(
        acompanhamentoExternoSvoModel.revogarCredencial
      ).mockResolvedValueOnce({
        solicitacao_id: 101,
        revogada_em: new Date('2026-11-27T14:00:00.000Z'),
        alterada: true,
        revogada_motivo: 'Solicitação de bloqueio por exposição acidental',
        atualizado_em: new Date('2026-11-27T14:00:00.000Z'),
      });

      const respOk = await request(app)
        .post('/api/solicitacoes-svo/101/credencial-externa/revogar')
        .set('Authorization', 'Bearer token-gestor')
        .send({ motivo: 'Solicitação de bloqueio por exposição acidental' });

      expect(respOk.status).toBe(200);
      expect(respOk.body.solicitacao_id).toBe(101);
      expect(auditoriaModel.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: 4,
          modulo: 'SOLICITACOES_SVO',
          acao: 'REVOGOU_CREDENCIAL_EXTERNA_SVO solicitacao_id=101',
        }),
        trx
      );

      autenticarComo(PERFIS.MOTORISTA_SVO, 9);
      const respProibida = await request(app)
        .post('/api/solicitacoes-svo/101/credencial-externa/revogar')
        .set('Authorization', 'Bearer token-motorista')
        .send({ motivo: 'Tentativa indevida' });

      expect(respProibida.status).toBe(403);
    });
  });

  describe('4. Mapeamento unitário de mensagens públicas sem justificativa interna', () => {
    it('inclui aviso de pedido de cancelamento pendente ou mensagem pública de negativa sem alterar status real', () => {
      const comPedidoPendente = mapearStatusPublicoAcompanhamentoSvo({
        status_solicitacao: 'CONFIRMADA',
        ordem_status: 'AGUARDANDO_ALOCACAO',
        analise_iniciada_em: new Date('2026-11-27T10:10:00.000Z'),
        motivo_recusa_publico: null,
        cancelamento_status: 'PENDENTE',
        cancelamento_mensagem_publica: null,
      });

      expect(comPedidoPendente.status).toBe('CONFIRMADA');
      expect(comPedidoPendente.mensagem_publica).toContain(
        'Há um pedido de cancelamento registrado aguardando decisão do gestor do SVO.'
      );

      const comPedidoNegado = mapearStatusPublicoAcompanhamentoSvo({
        status_solicitacao: 'EM_ANDAMENTO',
        ordem_status: 'EM_DESLOCAMENTO',
        analise_iniciada_em: new Date('2026-11-27T10:10:00.000Z'),
        motivo_recusa_publico: null,
        cancelamento_status: 'NEGADO',
        cancelamento_mensagem_publica:
          'A equipe já iniciou o deslocamento para o local.',
      });

      expect(comPedidoNegado.status).toBe('EM_ANDAMENTO');
      expect(comPedidoNegado.mensagem_publica).toContain(
        'O pedido de cancelamento anterior não foi aprovado: A equipe já iniciou o deslocamento para o local.'
      );
    });
  });
});
