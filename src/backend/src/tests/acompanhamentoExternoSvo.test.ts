import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PERFIS, type Perfil } from '../constants/perfis';

const { trx, transaction } = vi.hoisted(() => {
  const trx = { isTransaction: true };
  return {
    trx,
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
    buscarPorProtocolo: vi.fn(),
    buscarTentativaPorChaveIdempotencia: vi.fn(),
    registrarAcessoValido: vi.fn(),
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
import {
  JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS,
  MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
  acompanhamentoExternoSvoService,
  calcularDigestCredencialExterna,
  gerarProtocoloExternoSvo,
  gerarSegredoCredencialExterna,
  mapearStatusPublicoAcompanhamentoSvo,
} from '../services/acompanhamentoExternoSvoService';

const PROTOCOLO_VALIDO_A = 'SVO-20261127-9F8E7D6C5B4A';
const PROTOCOLO_VALIDO_B = 'SVO-20261127-2B3C4D5E6F7G';
const CREDENCIAL_A = 'credencial_secreta_de_alta_entropia_chamado_A_012345';
const CREDENCIAL_B = 'credencial_secreta_de_alta_entropia_chamado_B_678901';

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
    motivo_recusa_publico: null,
    cancelamento_status: null,
    cancelamento_solicitado_em: null,
    cancelamento_decidido_em: null,
    cancelamento_justificativa_decisao: null,
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
  const flagAnterior = process.env.FASE3_ACOMPANHAMENTO_EXTERNO;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FASE3_ACOMPANHAMENTO_EXTERNO = 'true';
    transaction.mockImplementation(async (cb) => cb(trx));
    vi.mocked(
      acompanhamentoExternoSvoModel.registrarAcessoValido
    ).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (flagAnterior === undefined) {
      delete process.env.FASE3_ACOMPANHAMENTO_EXTERNO;
    } else {
      process.env.FASE3_ACOMPANHAMENTO_EXTERNO = flagAnterior;
    }
  });

  describe('1. Emissão de protocolo opaco, credencial de alta entropia e recuperação de tentativa (SCRUM-264 / SCRUM-266)', () => {
    it('gera protocolo público distinto do segredo de alta entropia e persiste apenas o digest protegido na transação', async () => {
      const protocolo = gerarProtocoloExternoSvo(
        new Date('2026-11-27T12:00:00.000Z')
      );
      const segredo = gerarSegredoCredencialExterna();

      expect(protocolo).toMatch(/^SVO-20261127-[A-Z0-9]{12}$/);
      expect(segredo).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(segredo).not.toBe(protocolo);

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
            payloadNormalizado: payload,
            agora: new Date('2026-11-27T12:00:00.000Z'),
          }
        );

      expect(emitido.protocolo).toBe(protocolo);
      expect(emitido.credencial).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(
        acompanhamentoExternoSvoModel.inserirCredencial
      ).toHaveBeenCalledTimes(1);

      const gravado = vi.mocked(acompanhamentoExternoSvoModel.inserirCredencial)
        .mock.calls[0]?.[0];
      expect(gravado?.solicitacao_id).toBe(101);
      expect(gravado?.segredo_digest).toMatch(/^[0-9a-f]{64}$/);
      // O segredo em claro jamais e persistido; nenhum envelope e gravado (removido na SCRUM-263)
      expect(gravado?.segredo_digest).not.toContain(emitido.credencial);
      expect(gravado).not.toHaveProperty('envelope_recuperacao');
      expect(gravado?.payload_criacao_digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('exige chave de idempotência e payload (NOT NULL na SCRUM-263) e não expõe endpoint de recuperação por envelope', async () => {
      await expect(
        acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx as never, {
          solicitacaoId: 101,
          protocolo: PROTOCOLO_VALIDO_A,
          chaveIdempotencia: '',
          payloadNormalizado: undefined,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(acompanhamentoExternoSvoModel.inserirCredencial).not.toHaveBeenCalled();

      const resposta = await request(app)
        .post('/api/solicitacoes-svo/externas/recuperar-comprovante')
        .send({});
      expect(resposta.status).not.toBe(200);
      expect(resposta.body.credencial).toBeUndefined();
    });
  });

  describe('2. Os 7 estados públicos de acompanhamento e DTO allowlist (sem PII, equipe, veículo, GPS ou motivo interno)', () => {
    it.each([
      {
        cenario: 'Recebida (recém-registrada na fila)',
        overrides: {
          status_solicitacao: 'EM_TRIAGEM' as const,
          versao_dados: 1,
          cancelamento_status: null,
        },
        esperadoStatus: 'RECEBIDA',
        esperadoLabel: 'Recebida',
        permiteEditar: true,
        permiteCancelar: true,
      },
      {
        cenario: 'Em análise (em triagem com revisão/edição ou pedido pendente)',
        overrides: {
          status_solicitacao: 'EM_TRIAGEM' as const,
          versao_dados: 2,
          cancelamento_status: null,
        },
        esperadoStatus: 'EM_ANALISE',
        esperadoLabel: 'Em análise',
        permiteEditar: true,
        permiteCancelar: true,
      },
      {
        cenario: 'Confirmada (aguardando alocação)',
        overrides: {
          status_solicitacao: 'CONFIRMADA' as const,
          confirmado_em: new Date('2026-11-27T11:00:00.000Z'),
          ordem_status: 'AGUARDANDO_ALOCACAO' as const,
        },
        esperadoStatus: 'CONFIRMADA',
        esperadoLabel: 'Confirmada',
        permiteEditar: false,
        permiteCancelar: true,
      },
      {
        cenario: 'Em andamento (ordem alocada / em deslocamento / no local)',
        overrides: {
          status_solicitacao: 'EM_ANDAMENTO' as const,
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
        },
        esperadoStatus: 'CONCLUIDA',
        esperadoLabel: 'Concluída',
        permiteEditar: false,
        permiteCancelar: false,
      },
      {
        cenario: 'Não acolhida (recusada com mensagem pública específica)',
        overrides: {
          status_solicitacao: 'RECUSADA' as const,
          motivo_recusa_publico:
            'Caso com indício de causa externa encaminhado ao IML.',
          encerrado_operacional_em: new Date('2026-11-27T11:20:00.000Z'),
        },
        esperadoStatus: 'NAO_ACOLHIDA',
        esperadoLabel: 'Não acolhida',
        permiteEditar: false,
        permiteCancelar: false,
      },
      {
        cenario: 'Cancelada',
        overrides: {
          status_solicitacao: 'CANCELADA' as const,
          cancelamento_status: 'ACEITO' as const,
          cancelamento_decidido_em: new Date('2026-11-27T11:45:00.000Z'),
          cancelamento_justificativa_decisao:
            'Cancelamento confirmado a pedido do solicitante antes da saída.',
          encerrado_operacional_em: new Date('2026-11-27T11:45:00.000Z'),
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

        // Allowlist estrita: garante que nenhum campo interno ou PII vaze no DTO
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
          /motorista|veiculo|placa|equipe|latitude|longitude|cpf|falecido|motivo_recusa"/i
        );
      }
    );

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

  describe('3. Isolamento entre credenciais, proibição de segredo na URL, janela de 30 dias e revogação', () => {
    it('rejeita protocolo isolado, credencial incorreta e combinação cruzada (protocolo A com credencial B) com resposta 401 uniforme', async () => {
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockImplementation(async (protocolo) => {
        if (protocolo === PROTOCOLO_VALIDO_A) {
          return criarRegistroBase({
            protocolo: PROTOCOLO_VALIDO_A,
            segredo_digest: calcularDigestCredencialExterna(
              CREDENCIAL_A,
              'HMAC-SHA-256'
            ),
          });
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

      // 1. Protocolo isolado sem credencial
      const semCredencial = await request(app)
        .get(
          `/api/solicitacoes-svo/externas/acompanhamento/${PROTOCOLO_VALIDO_A}`
        );

      // 2. Protocolo A com credencial B (combinacao cruzada)
      const cruzada = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({
          protocolo: PROTOCOLO_VALIDO_A,
          credencial: CREDENCIAL_B,
        });

      // 3. Protocolo inexistente com credencial A
      const protocoloInexistente = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({
          protocolo: 'SVO-20261127-999999999999',
          credencial: CREDENCIAL_A,
        });

      for (const resp of [semCredencial, cruzada, protocoloInexistente]) {
        expect(resp.status).toBe(401);
        expect(resp.body).toEqual({
          erro: MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
          codigo: 'CREDENCIAL_EXTERNA_INVALIDA',
        });
      }
    });

    it('rejeita qualquer tentativa de enviar credencial ou parâmetros na query string (URL)', async () => {
      const respostaGet = await request(app).get(
        `/api/solicitacoes-svo/externas/acompanhamento/${PROTOCOLO_VALIDO_A}?credencial=${CREDENCIAL_A}`
      );
      expect(respostaGet.status).toBe(400);
      expect(respostaGet.body.codigo).toBe('CREDENCIAIS_NA_URL_PROIBIDAS');

      const respostaPost = await request(app)
        .post(
          `/api/solicitacoes-svo/externas/acompanhamento?segredo=${CREDENCIAL_A}`
        )
        .send({
          protocolo: PROTOCOLO_VALIDO_A,
          credencial: CREDENCIAL_A,
        });
      expect(respostaPost.status).toBe(400);
      expect(respostaPost.body.codigo).toBe('CREDENCIAIS_NA_URL_PROIBIDAS');
    });

    it('permite consulta até o limite exato de 30 dias após encerramento e rejeita 1ms após 30 dias ou após revogação', async () => {
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

      // No limite exato de 30 dias -> permitido
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(registroEncerrado);
      const noLimite =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          PROTOCOLO_VALIDO_A,
          CREDENCIAL_A,
          { agora: limiteExato30Dias }
        );
      expect(noLimite.status).toBe('CONCLUIDA');

      // 1ms apos 30 dias -> rejeitado com 401 uniforme
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce(registroEncerrado);
      await expect(
        acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          PROTOCOLO_VALIDO_A,
          CREDENCIAL_A,
          { agora: apos30Dias }
        )
      ).rejects.toMatchObject({
        statusCode: 401,
        codigo: 'CREDENCIAL_EXTERNA_INVALIDA',
      });

      // Credencial revogada mesmo dentro do prazo -> rejeitada com 401 uniforme
      vi.mocked(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).mockResolvedValueOnce({
        ...registroEncerrado,
        revogada_em: new Date('2026-10-02T00:00:00.000Z'),
      });
      await expect(
        acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          PROTOCOLO_VALIDO_A,
          CREDENCIAL_A,
          { agora: new Date('2026-10-05T00:00:00.000Z') }
        )
      ).rejects.toMatchObject({
        statusCode: 401,
        codigo: 'CREDENCIAL_EXTERNA_INVALIDA',
      });
    });

    it('bloqueia endpoints públicos com 404 RECURSO_DESATIVADO quando FASE3_ACOMPANHAMENTO_EXTERNO está desligada', async () => {
      process.env.FASE3_ACOMPANHAMENTO_EXTERNO = 'false';

      const resposta = await request(app)
        .post('/api/solicitacoes-svo/externas/acompanhamento')
        .send({
          protocolo: PROTOCOLO_VALIDO_A,
          credencial: CREDENCIAL_A,
        });

      expect(resposta.status).toBe(404);
      expect(resposta.body.codigo).toBe('RECURSO_DESATIVADO');
      expect(
        acompanhamentoExternoSvoModel.buscarPorProtocolo
      ).not.toHaveBeenCalled();
    });

    it('permite revogação auditada da credencial apenas por GESTOR_SVO associado ou ADMINISTRADOR', async () => {
      const autenticarComo = (perfil: Perfil, id = 4) =>
        vi.mocked(authService.usuarioDoToken).mockResolvedValue({
          id,
          perfil,
        } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

      autenticarComo(PERFIS.GESTOR_SVO, 4);
      vi.mocked(
        acompanhamentoExternoSvoModel.revogarCredencial
      ).mockResolvedValueOnce({
        ...criarRegistroBase(),
        chave_idempotencia_criacao: 'tentativa-revogada-01',
        payload_criacao_digest: 'b'.repeat(64),
        prova_tentativa_digest: null,
        revogada_em: new Date('2026-11-27T14:00:00.000Z'),
        revogada_motivo: 'Solicitação de bloqueio por exposição acidental',
        ultimo_acesso_em: null,
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

      // Perfil sem permissao (MOTORISTA_SVO) -> 403
      autenticarComo(PERFIS.MOTORISTA_SVO, 9);
      const respProibida = await request(app)
        .post('/api/solicitacoes-svo/101/credencial-externa/revogar')
        .set('Authorization', 'Bearer token-motorista')
        .send({ motivo: 'Tentativa indevida' });

      expect(respProibida.status).toBe(403);
    });
  });

  describe('4. Mapeamento unitário de mensagens públicas com pedido de cancelamento pendente ou negado', () => {
    it('inclui aviso de pedido de cancelamento pendente ou justificativa de negativa sem alterar o status operacional real', () => {
      const comPedidoPendente = mapearStatusPublicoAcompanhamentoSvo({
        status_solicitacao: 'CONFIRMADA',
        ordem_status: 'AGUARDANDO_ALOCACAO',
        versao_dados: 1,
        motivo_recusa_publico: null,
        cancelamento_status: 'PENDENTE',
        cancelamento_justificativa_decisao: null,
      });

      expect(comPedidoPendente.status).toBe('CONFIRMADA');
      expect(comPedidoPendente.mensagem_publica).toContain(
        'Há um pedido de cancelamento registrado aguardando decisão do gestor do SVO.'
      );

      const comPedidoNegado = mapearStatusPublicoAcompanhamentoSvo({
        status_solicitacao: 'EM_ANDAMENTO',
        ordem_status: 'EM_DESLOCAMENTO',
        versao_dados: 1,
        motivo_recusa_publico: null,
        cancelamento_status: 'NEGADO',
        cancelamento_justificativa_decisao:
          'A equipe já iniciou o deslocamento para o local.',
      });

      expect(comPedidoNegado.status).toBe('EM_ANDAMENTO');
      expect(comPedidoNegado.mensagem_publica).toContain(
        'O pedido de cancelamento anterior não foi aprovado: A equipe já iniciou o deslocamento para o local.'
      );
    });
  });
});
