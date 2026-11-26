import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { configNotificacoes } from '../config/notificacoes';
import { db } from '../config/database';
import { processarFilaPush, type EnviadorPush } from '../services/filaPush';
import { EVENTO_SVO_S1, CATEGORIA_NOTIFICACAO_SVO, notificacaoSvoService } from '../services/notificacaoSvoService';
import { solicitacaoSvoService } from '../services/solicitacaoSvoService';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

const habilitado = process.env.SCRUM233_POSTGRES_TESTS === '1';
const dados = { dados_solicitante: 'Nome reservado', local_ocorrencia: 'Endereço reservado', material_sensivel: true };

async function conta(perfil: string, { associado = false, ativo = true } = {}) {
  const [usuario] = await db('usuarios').insert({
    nome: 'Teste', email: randomUUID() + '@testes.invalid', senha: 'hash-de-teste', tipo_usuario: perfil, perfil, ativo,
  }).returning('id');
  if (associado) {
    const unidade = await db('unidades').where({ nome: 'SVO' }).first('id');
    await db('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: usuario.id });
  }
  return usuario.id as number;
}

describe.skipIf(!habilitado)('SCRUM-233 com fila e PostgreSQL descartável', () => {
  // Processa a fila de push compartilhada: uma suíte de fila por vez no banco
  usarBancoComExclusividade();
  beforeAll(() => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('Banco de teste não autorizado');
    }
  });
  afterEach(() => { configNotificacoes.ativas = false; vi.restoreAllMocks(); });
  afterAll(() => db.destroy());

  it('publica S1 idempotente, exclui o autor e consulta a preferência atual na fila', async () => {
    configNotificacoes.ativas = true;
    const autor = await conta('GESTOR_SVO', { associado: true });
    const gestor = await conta('GESTOR_SVO', { associado: true });
    const admin = await conta('ADMINISTRADOR');
    const semVinculo = await conta('GESTOR_SVO');
    const inativo = await conta('GESTOR_SVO', { associado: true, ativo: false });
    const pedido = await solicitacaoSvoService.registrar(dados, autor);
    await db.transaction((trx) => notificacaoSvoService.publicarAlertasRegistroSolicitacao(pedido, autor, trx));
    const filtro = { operacao: 'SVO', referencia_tipo: 'SOLICITACAO_SVO', referencia_id: pedido.id };
    const avisos = await db('notificacoes').where({ ...filtro, tipo: EVENTO_SVO_S1 });
    expect(avisos.map((aviso) => aviso.usuario_id)).toEqual(expect.arrayContaining([gestor, admin]));
    const confirmacao = await solicitacaoSvoService.confirmar(pedido.id, { id: autor, perfil: 'GESTOR_SVO' });
    const repeticao = await solicitacaoSvoService.confirmar(pedido.id, { id: autor, perfil: 'GESTOR_SVO' });
    expect(repeticao.ordem.id).toBe(confirmacao.ordem.id);
    expect(repeticao.criada).toBe(false);
    expect(await db('notificacoes').where(filtro).distinct().pluck('tipo')).toEqual([EVENTO_SVO_S1]);
    expect(await db('notificacao_outbox').where(filtro).distinct().pluck('evento_tipo')).toEqual([EVENTO_SVO_S1]);
    const referenciaOrdem = { operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: confirmacao.ordem.id };
    expect(await db('notificacoes').where(referenciaOrdem)).toHaveLength(0);
    expect(await db('notificacao_outbox').where(referenciaOrdem)).toHaveLength(0);
    expect(avisos.some((aviso) => [autor, semVinculo, inativo].includes(aviso.usuario_id))).toBe(false);
    const endpoint = 'https://push.exemplo/' + randomUUID();
    await db('push_subscriptions').insert({ usuario_id: gestor, endpoint, p256dh: randomUUID(), auth: randomUUID() });
    await db('preferencias_notificacao').insert({
      usuario_id: gestor, categoria: CATEGORIA_NOTIFICACAO_SVO, habilitado: true,
    });
    // Prioriza as duas entregas deste cenário mesmo quando outras suítes deixaram a fila cheia.
    await db('notificacao_outbox').where(filtro).whereIn('usuario_id', [gestor, admin])
      .update({ proxima_execucao_em: '2000-01-01T00:00:00Z' });
    const enviador = vi.fn<EnviadorPush>().mockResolvedValue({ status: 201 });
    await processarFilaPush(enviador);
    const idAviso = avisos.find((aviso) => aviso.usuario_id === gestor).id;
    const entrega = enviador.mock.calls.find(([, payload]) => payload.notificacao_id === idAviso);
    expect(entrega?.[1]).toEqual({
      notificacao_id: idAviso, titulo: 'Nova solicitação SVO para triagem',
      corpo: 'Há uma solicitação aguardando análise.', url: '/solicitacoes?aba=svo',
      tag: 'svo-solicitacao-' + pedido.id,
    });
    expect(await db('notificacao_outbox').where({ ...filtro, evento_tipo: EVENTO_SVO_S1, usuario_id: gestor })).toHaveLength(1);
    expect(await db('notificacao_outbox').where({ ...filtro, evento_tipo: EVENTO_SVO_S1, usuario_id: admin }).first())
      .toMatchObject({ status: 'IGNORADO', ultimo_erro: 'CATEGORIA_DESLIGADA' });
  });

  it('mantém solicitações com a flag desligada e desfaz a criação se a publicação falhar', async () => {
    const autor = await conta('GESTOR_SVO', { associado: true });
    const pedido = await solicitacaoSvoService.registrar(dados, autor);
    expect(await db('notificacoes').where({ tipo: EVENTO_SVO_S1, operacao: 'SVO', referencia_tipo: 'SOLICITACAO_SVO', referencia_id: pedido.id })).toHaveLength(0);

    configNotificacoes.ativas = true;
    const publicador = notificacaoSvoService.publicarAlertasRegistroSolicitacao;
    const local = randomUUID();
    vi.spyOn(notificacaoSvoService, 'publicarAlertasRegistroSolicitacao').mockImplementation(async (...args) => {
      await publicador(...args);
      throw new Error('Falha simulada depois da publicação');
    });
    await expect(solicitacaoSvoService.registrar({ ...dados, local_ocorrencia: local }, autor)).rejects.toThrow('Falha simulada');
    expect(await db('solicitacoes_svo').where({ local_ocorrencia: local })).toHaveLength(0);
  });
});
