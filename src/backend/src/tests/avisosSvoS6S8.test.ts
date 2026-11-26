import type { Knex } from 'knex';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// SCRUM-235: formato dos avisos S6, S7 e S8 sem banco. O fluxo real (transições, fila, acesso) está em
// avisosSvoS6S8Postgres.test.ts.
vi.mock('../config/notificacoes', () => ({ configNotificacoes: { ativas: true } }));
vi.mock('../services/publicacaoNotificacoes', () => ({ publicarNotificacao: vi.fn(async () => ({ criadas: 1 })) }));

import { configNotificacoes } from '../config/notificacoes';
import { notificacaoSvoService } from '../services/notificacaoSvoService';
import { publicarNotificacao } from '../services/publicacaoNotificacoes';

// Consulta encadeável do knex: `pluck` devolve a audiência e `first` o motorista
function trxFalsa({ audiencia = [5, 6], motoristaAtivo = true } = {}) {
  const consulta: Record<string, unknown> = {};
  for (const metodo of ['leftJoin', 'join', 'where', 'andWhere', 'whereNotNull', 'distinct', 'orderBy']) {
    consulta[metodo] = () => consulta;
  }
  consulta.pluck = async () => audiencia;
  consulta.first = async () => (motoristaAtivo ? { id: 9 } : undefined);
  return Object.assign(() => consulta, { isTransaction: true }) as unknown as Knex.Transaction;
}

const publicado = () => vi.mocked(publicarNotificacao).mock.calls.at(-1)![1];

beforeEach(() => {
  vi.clearAllMocks();
  configNotificacoes.ativas = true;
});

describe('S6 e S7: só na central', () => {
  it('S6 sem push, por ordem, com o autor informado para ser excluído', async () => {
    await notificacaoSvoService.publicarChegadaLocal(41, 9, trxFalsa());
    expect(publicado()).toMatchObject({
      tipo: 'SVO_CHEGADA_LOCAL', operacao: 'SVO', referencia: { tipo: 'ORDEM_SVO', id: 41 },
      ocorrencia: 'chegada-local', autorId: 9, destinatarios: [5, 6], urlDestino: '/viagens?aba=svo',
    });
    expect(publicado().push).toBeUndefined();
  });

  it('S7 do deslocamento: ocorrência pelo deslocamento e as ordens citadas até 10', async () => {
    const ordens = Array.from({ length: 13 }, (_, i) => 100 + i);
    await notificacaoSvoService.publicarConclusaoColeta({ deslocamentoId: 7, ordens }, 112, 9, trxFalsa());
    const evento = publicado();
    expect(evento).toMatchObject({ tipo: 'SVO_COLETA_CONCLUIDA', ocorrencia: 'deslocamento:7', referencia: { id: 112 } });
    expect(evento.push).toBeUndefined();
    expect(evento.mensagem).toContain('#109');
    expect(evento.mensagem).not.toContain('#110');
    expect(evento.mensagem).toContain('e mais 3');
    expect([...evento.mensagem].length).toBeLessThanOrEqual(280);
  });

  it('S7 de ordem sem deslocamento (anterior às fotos): ocorrência pela ordem', async () => {
    await notificacaoSvoService.publicarConclusaoColeta({ deslocamentoId: null, ordens: [55] }, 55, 9, trxFalsa());
    expect(publicado()).toMatchObject({ ocorrencia: 'ordem:55', titulo: 'Coleta SVO concluída' });
  });
});

describe('S8: push com texto fixo', () => {
  it('pedido com push SVO e sem o motivo', async () => {
    await notificacaoSvoService.publicarExcecaoSolicitada({ id: 3, fase: 'CHEGADA' }, 41, 9, trxFalsa());
    expect(publicado()).toMatchObject({
      tipo: 'EXCECAO_ODOMETRO_SOLICITADA', ocorrencia: 'CHEGADA:3:solicitada', severidade: 'warning',
      push: { categoria: 'SVO', titulo: 'Pedido sem foto', corpo: 'Um pedido de autorização aguarda análise.', tag: 'svo-excecao-3' },
    });
    expect(publicado().mensagem).toContain('chegada');
  });

  it.each([['APROVADA', 'aprovado', 'success'], ['RECUSADA', 'recusado', 'warning']] as const)(
    'decisão %s vai só ao motorista que pediu', async (decisao, texto, severidade) => {
      await notificacaoSvoService.publicarExcecaoDecidida({ id: 3, fase: 'SAIDA', solicitada_por: 9 }, decisao, 41, 2, trxFalsa());
      expect(publicado()).toMatchObject({
        tipo: 'EXCECAO_ODOMETRO_DECIDIDA', destinatarios: [9], autorId: 2, severidade,
        ocorrencia: `SAIDA:3:${decisao.toLowerCase()}`, push: { categoria: 'SVO', corpo: `Seu pedido foi ${texto}.` },
      });
    }
  );

  it('motorista inativo ou fora do perfil: decisão sem aviso', async () => {
    await notificacaoSvoService.publicarExcecaoDecidida(
      { id: 3, fase: 'SAIDA', solicitada_por: 9 }, 'APROVADA', 41, 2, trxFalsa({ motoristaAtivo: false })
    );
    expect(publicarNotificacao).not.toHaveBeenCalled();
  });
});

it('com NOTIFICACOES_ATIVAS desligado, nada é publicado', async () => {
  configNotificacoes.ativas = false;
  const trx = trxFalsa();
  await notificacaoSvoService.publicarChegadaLocal(1, 2, trx);
  await notificacaoSvoService.publicarConclusaoColeta({ deslocamentoId: 1, ordens: [1] }, 1, 2, trx);
  await notificacaoSvoService.publicarExcecaoSolicitada({ id: 1, fase: 'SAIDA' }, 1, 2, trx);
  await notificacaoSvoService.publicarExcecaoDecidida({ id: 1, fase: 'SAIDA', solicitada_por: 3 }, 'APROVADA', 1, 2, trx);
  expect(publicarNotificacao).not.toHaveBeenCalled();
});
