import type { Knex } from 'knex';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERFIS } from '../constants/perfis';
import { UNIDADES } from '../constants/unidades';
import {
  CATEGORIA_NOTIFICACAO_SVO,
  EVENTO_SVO_S1,
  EVENTO_SVO_S2,
  FONTE_MATERIAL_SENSIVEL_SVO_CONFIRMADA,
  notificacaoSvoService,
  URL_DESTINO_TRIAGEM_SVO,
} from '../services/notificacaoSvoService';

interface UsuarioFixture {
  id: number;
  perfil: string;
  ativo: boolean;
  associadoSvo: boolean;
  pushHabilitado: boolean;
}

interface RegistroNotificacao {
  id: number;
  usuario_id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  severidade: string;
  operacao: string;
  referencia_tipo: string | null;
  referencia_id: number | null;
  url_destino: string;
  chave_idempotencia: string;
  lida_em: Date | null;
}

interface RegistroOutbox {
  id: number;
  notificacao_id: number | null;
  usuario_id: number;
  evento_tipo: string;
  categoria: string;
  operacao: string;
  referencia_tipo: string | null;
  referencia_id: number | null;
  ocorrencia_versao: string;
  chave_idempotencia: string;
  canal: string;
  payload_push: string;
  status: string;
  processado_em: unknown;
}

function criarTrxEmMemoria(usuarios: UsuarioFixture[], opcoes?: { falharNoInsert?: boolean }) {
  const notificacoes: RegistroNotificacao[] = [];
  const outbox: RegistroOutbox[] = [];
  let seqNotif = 1;
  let seqOutbox = 1;

  const trx = Object.assign(
    (tabela: string) => {
      if (tabela === 'usuarios as u') {
        const audienciasFiltradas = usuarios
          .filter(
            (u) =>
              u.ativo &&
              (u.perfil === PERFIS.ADMINISTRADOR ||
                (u.perfil === PERFIS.GESTOR_SVO && u.associadoSvo)),
          )
          .sort((a, b) => a.id - b.id)
          .map((u) => ({
            id: u.id,
            perfil: u.perfil,
            pushHabilitado: u.pushHabilitado,
          }));

        const chain = {
          leftJoin: vi.fn(() => chain),
          where: vi.fn(() => chain),
          andWhere: vi.fn(() => chain),
          distinct: vi.fn(() => chain),
          orderBy: vi.fn(() => chain),
          select: vi.fn(() => chain),
          then: (resolve: (valor: typeof audienciasFiltradas) => unknown) =>
            Promise.resolve(audienciasFiltradas).then(resolve),
        };
        return chain;
      }

      if (tabela === 'notificacoes') {
        let pendente: Omit<RegistroNotificacao, 'id' | 'lida_em'> | null = null;
        let ignorarConflito = false;

        const chain = {
          insert: vi.fn((dados: Omit<RegistroNotificacao, 'id' | 'lida_em'>) => {
            pendente = dados;
            return chain;
          }),
          onConflict: vi.fn(() => chain),
          ignore: vi.fn(() => {
            ignorarConflito = true;
            return chain;
          }),
          returning: vi.fn(async () => {
            if (opcoes?.falharNoInsert) {
              throw new Error('Falha simulada ao persistir notificação na transação');
            }
            if (!pendente) return [];
            const duplicada = notificacoes.some(
              (n) =>
                n.usuario_id === pendente!.usuario_id &&
                n.chave_idempotencia === pendente!.chave_idempotencia,
            );
            if (duplicada && ignorarConflito) {
              return [];
            }
            const criada: RegistroNotificacao = {
              id: seqNotif++,
              lida_em: null,
              ...pendente,
            };
            notificacoes.push(criada);
            return [{ id: criada.id }];
          }),
        };
        return chain;
      }

      if (tabela === 'notificacao_outbox') {
        let pendente: Omit<RegistroOutbox, 'id'> | null = null;
        let ignorarConflito = false;

        const chain = {
          insert: vi.fn((dados: Omit<RegistroOutbox, 'id'>) => {
            pendente = dados;
            return chain;
          }),
          onConflict: vi.fn(() => chain),
          ignore: vi.fn(() => {
            ignorarConflito = true;
            return chain;
          }),
          returning: vi.fn(async () => {
            if (!pendente) return [];
            const duplicada = outbox.some(
              (o) =>
                o.usuario_id === pendente!.usuario_id &&
                o.chave_idempotencia === pendente!.chave_idempotencia,
            );
            if (duplicada && ignorarConflito) {
              return [];
            }
            const criada: RegistroOutbox = {
              id: seqOutbox++,
              ...pendente,
            };
            outbox.push(criada);
            return [{ id: criada.id }];
          }),
        };
        return chain;
      }

      throw new Error(`Tabela inesperada no mock: ${tabela}`);
    },
    {
      raw: vi.fn(async (sql: string) => {
        if (sql.includes('to_regclass')) {
          return { rows: [{ reg: 'public.tabela' }] };
        }
        return sql;
      }),
      fn: {
        now: vi.fn(() => new Date().toISOString()),
      },
    },
  );

  return {
    trx: trx as unknown as Knex.Transaction,
    notificacoes,
    outbox,
  };
}

describe('Alertas SVO S1 e S2 — notificacaoSvoService', () => {
  const usuariosPadrao: UsuarioFixture[] = [
    { id: 1, perfil: PERFIS.ADMINISTRADOR, ativo: true, associadoSvo: false, pushHabilitado: true },
    { id: 2, perfil: PERFIS.GESTOR_SVO, ativo: true, associadoSvo: true, pushHabilitado: true },
    { id: 3, perfil: PERFIS.GESTOR_SVO, ativo: true, associadoSvo: false, pushHabilitado: true },
    { id: 4, perfil: PERFIS.GESTOR_SVO, ativo: false, associadoSvo: true, pushHabilitado: true },
    { id: 5, perfil: PERFIS.GESTOR_FROTA, ativo: true, associadoSvo: true, pushHabilitado: true },
    { id: 6, perfil: PERFIS.MOTORISTA_SVO, ativo: true, associadoSvo: true, pushHabilitado: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve publicar S1 (In-App + Outbox Push + Badge) apenas para ADMINISTRADOR ativo e GESTOR_SVO associado ao SVO', async () => {
    const { trx, notificacoes, outbox } = criarTrxEmMemoria(usuariosPadrao);

    const resultado = await notificacaoSvoService.publicarAlertasRegistroSolicitacao(
      { id: 42 },
      trx,
    );

    expect(resultado.s1PublicadosInApp).toBe(2);
    expect(resultado.s1EnfileiradosOutbox).toBe(2);
    expect(notificacoes).toHaveLength(2);
    expect(notificacoes.map((n) => n.usuario_id)).toEqual([1, 2]);

    for (const notif of notificacoes) {
      expect(notif.tipo).toBe(EVENTO_SVO_S1);
      expect(notif.operacao).toBe(UNIDADES.SVO);
      expect(notif.referencia_tipo).toBe('SOLICITACAO_SVO');
      expect(notif.referencia_id).toBe(42);
      expect(notif.url_destino).toBe(URL_DESTINO_TRIAGEM_SVO);
      expect(notif.url_destino).toBe('/solicitacoes?aba=svo');
      expect(notif.lida_em).toBeNull();
    }

    expect(outbox).toHaveLength(2);
    for (const item of outbox) {
      expect(item.evento_tipo).toBe(EVENTO_SVO_S1);
      expect(item.categoria).toBe(CATEGORIA_NOTIFICACAO_SVO);
      expect(item.canal).toBe('WEB_PUSH');
      expect(item.status).toBe('PENDENTE');
      const payload = JSON.parse(item.payload_push) as {
        tag: string;
        data: { url: string; operacao: string; referenciaId: number };
      };
      expect(payload.tag).toBe('svo-solicitacao-42');
      expect(payload.data.url).toBe('/solicitacoes?aba=svo');
      expect(payload.data.operacao).toBe('SVO');
      expect(payload.data.referenciaId).toBe(42);
    }
  });

  it('não deve notificar usuários sem perfil permitido, GESTOR_SVO sem associação à unidade SVO ou usuários inativos', async () => {
    const somenteNaoElegiveis = usuariosPadrao.filter((u) => ![1, 2].includes(u.id));
    const { trx, notificacoes, outbox } = criarTrxEmMemoria(somenteNaoElegiveis);

    const resultado = await notificacaoSvoService.publicarAlertasRegistroSolicitacao(
      { id: 55 },
      trx,
    );

    expect(resultado.s1PublicadosInApp).toBe(0);
    expect(resultado.s1EnfileiradosOutbox).toBe(0);
    expect(notificacoes).toHaveLength(0);
    expect(outbox).toHaveLength(0);
  });

  it('deve respeitar LGPD no Push e In-App sem expor ocorrência, endereço ou nome do solicitante', async () => {
    const { trx, notificacoes, outbox } = criarTrxEmMemoria(usuariosPadrao);
    const dadosSensiveis = {
      dadosSolicitante: 'Maria Joaquina da Silva - CPF 123.456.789-00 - Tel (79) 99999-0000',
      localOcorrencia: 'Rua das Flores, 987, Bairro Jardins, Aracaju/SE - Óbito domiciliar',
    };

    await notificacaoSvoService.publicarAlertasRegistroSolicitacao({ id: 77 }, trx, {
      fonteMaterialSensivelSvoConfirmada: true,
      materialSensivelSvoDominio: true,
    });

    const textosPersistidos = [
      ...notificacoes.flatMap((n) => [n.titulo, n.mensagem, n.url_destino, n.chave_idempotencia]),
      ...outbox.map((o) => o.payload_push),
    ].join(' | ');

    expect(textosPersistidos).not.toContain('Maria Joaquina');
    expect(textosPersistidos).not.toContain('123.456.789-00');
    expect(textosPersistidos).not.toContain('Rua das Flores');
    expect(textosPersistidos).not.toContain('Bairro Jardins');
    expect(textosPersistidos).not.toContain('Óbito domiciliar');
    expect(textosPersistidos).not.toContain(dadosSensiveis.dadosSolicitante);
    expect(textosPersistidos).not.toContain(dadosSensiveis.localOcorrencia);
  });

  it('deve garantir idempotência ao reprocessar o mesmo alerta sem duplicar registros', async () => {
    const { trx, notificacoes, outbox } = criarTrxEmMemoria(usuariosPadrao);

    const primeira = await notificacaoSvoService.publicarAlertasRegistroSolicitacao({ id: 88 }, trx);
    const segunda = await notificacaoSvoService.publicarAlertasRegistroSolicitacao({ id: 88 }, trx);

    expect(primeira.s1PublicadosInApp).toBe(2);
    expect(segunda.s1PublicadosInApp).toBe(0);
    expect(segunda.s1EnfileiradosOutbox).toBe(0);
    expect(notificacoes).toHaveLength(2);
    expect(outbox).toHaveLength(2);
  });

  it('deve propagar erro na transação para impedir commit parcial da solicitação sem notificação', async () => {
    const { trx } = criarTrxEmMemoria(usuariosPadrao, { falharNoInsert: true });

    await expect(
      notificacaoSvoService.publicarAlertasRegistroSolicitacao({ id: 91 }, trx),
    ).rejects.toThrow('Falha simulada ao persistir notificação na transação');
  });

  it('deve manter S2 bloqueado quando fonte legítima de material sensível SVO estiver ausente na develop', async () => {
    expect(FONTE_MATERIAL_SENSIVEL_SVO_CONFIRMADA).toBe(false);
    const { trx, notificacoes, outbox } = criarTrxEmMemoria(usuariosPadrao);

    const resultado = await notificacaoSvoService.publicarAlertasRegistroSolicitacao(
      { id: 105 },
      trx,
      {
        materialSensivelSvoDominio: true,
      },
    );

    expect(resultado.s1PublicadosInApp).toBe(2);
    expect(resultado.s2PublicadosInApp).toBe(0);
    expect(resultado.s2EnfileiradosOutbox).toBe(0);
    expect(resultado.s2BloqueadoMotivo).toBe('FONTE_DOMINIO_SVO_MATERIAL_SENSIVEL_NAO_CONFIRMADA');
    expect(notificacoes.some((n) => n.tipo === EVENTO_SVO_S2)).toBe(false);
    expect(outbox.some((o) => o.evento_tipo === EVENTO_SVO_S2)).toBe(false);
  });

  it('deve ativar S2 condicionalmente somente após domínio confirmado, com mesma audiência e tag svo-sensivel-{id}', async () => {
    const { trx, notificacoes, outbox } = criarTrxEmMemoria(usuariosPadrao);

    const resultado = await notificacaoSvoService.publicarAlertasRegistroSolicitacao(
      { id: 120 },
      trx,
      {
        fonteMaterialSensivelSvoConfirmada: true,
        materialSensivelSvoDominio: true,
      },
    );

    expect(resultado.s2BloqueadoMotivo).toBeNull();
    expect(resultado.s2PublicadosInApp).toBe(2);
    expect(resultado.s2EnfileiradosOutbox).toBe(2);

    const notificacoesS2 = notificacoes.filter((n) => n.tipo === EVENTO_SVO_S2);
    expect(notificacoesS2).toHaveLength(2);
    expect(notificacoesS2.map((n) => n.usuario_id)).toEqual([1, 2]);
    for (const n of notificacoesS2) {
      expect(n.severidade).toBe('danger');
      expect(n.operacao).toBe('SVO');
      expect(n.url_destino).toBe('/solicitacoes?aba=svo');
    }

    const outboxS2 = outbox.filter((o) => o.evento_tipo === EVENTO_SVO_S2);
    expect(outboxS2).toHaveLength(2);
    for (const o of outboxS2) {
      const payload = JSON.parse(o.payload_push) as { tag: string; data: { url: string } };
      expect(payload.tag).toBe('svo-sensivel-120');
      expect(payload.data.url).toBe('/solicitacoes?aba=svo');
    }
  });
});