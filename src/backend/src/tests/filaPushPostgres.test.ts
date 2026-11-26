import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configNotificacoes } from '../config/notificacoes';
import { db } from '../config/database';
import { notificacaoOutboxModel } from '../models/notificacaoOutboxModel';
import { definirEnviadorPush, processarFilaPush, type EnviadorPush } from '../services/filaPush';
import { publicarNotificacao, type EventoNotificacao } from '../services/publicacaoNotificacoes';

// Publicação e fila (SCRUM-229) contra as tabelas das SCRUM-225/228/236. Só executa num banco descartável
// explicitamente identificado, depois de `npm run migrate`.
const habilitado = process.env.SCRUM229_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(8).toString('hex');

async function usuario(dados: Record<string, unknown> = {}): Promise<number> {
  const [u] = await db('usuarios').insert({
    nome: 'Teste', email: `${nonce()}@testes.invalid`, senha: 'hash-de-teste', perfil: 'GESTOR_FROTA',
    tipo_usuario: 'GESTOR_FROTA', ...dados,
  }).returning('id');
  return u.id;
}

async function ligarPush(usuario_id: number, aparelhos = 1): Promise<string[]> {
  await db('preferencias_notificacao').insert({ usuario_id, categoria: 'VIAGENS', habilitado: true })
    .onConflict(['usuario_id', 'categoria', 'canal']).merge();
  const endpoints = Array.from({ length: aparelhos }, () => `https://push.exemplo/${nonce()}`);
  for (const endpoint of endpoints) {
    await db('push_subscriptions').insert({ usuario_id, endpoint, p256dh: `${nonce()}${nonce()}`, auth: nonce() });
  }
  return endpoints;
}

const evento = (destinatarios: number[], dados: Partial<EventoNotificacao> = {}): EventoNotificacao => ({
  tipo: 'VIAGEM_AGENDADA', operacao: 'Administrativo', titulo: 'Viagem agendada', mensagem: 'Saída às 14:00.',
  urlDestino: '/viagens', referencia: { tipo: 'VIAGEM_FROTA', id: 108 }, ocorrencia: 'v1', autorId: null, destinatarios,
  push: { categoria: 'VIAGENS', titulo: 'Viagem agendada', corpo: 'Você tem uma viagem.', tag: 'viagem-108' },
  ...dados,
});
const publicar = (e: EventoNotificacao) => db.transaction((trx) => publicarNotificacao(trx, e));
const avisosDe = (id: number) => db('notificacoes').where({ usuario_id: id }).orderBy('id');
const filaDe = (id: number) => db('notificacao_outbox').where({ usuario_id: id }).orderBy('id');
const umItem = async (id: number) => (await filaDe(id))[0];
const vencerEspera = (usuario_id: number) =>
  db('notificacao_outbox').where({ usuario_id }).update({ proxima_execucao_em: db.raw("clock_timestamp() - interval '1 second'") });

describe.skipIf(!habilitado)('Publicação e fila de push em PostgreSQL descartável', () => {
  beforeAll(() => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
  });
  beforeEach(async () => {
    configNotificacoes.ativas = true;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // Fila limpa: o banco é descartável e as suítes não publicam em paralelo
    await db('notificacao_outbox').del();
  });
  afterEach(() => { configNotificacoes.ativas = false; definirEnviadorPush(null); });
  afterAll(() => db.destroy());

  describe('Publicação', () => {
    it('grava o aviso e a pendência de push de cada destinatário', async () => {
      const [a, b] = [await usuario(), await usuario()];
      expect(await publicar(evento([b, a, b]))).toEqual({ criadas: 2 });
      for (const id of [a, b]) {
        const [aviso] = await avisosDe(id);
        expect(aviso).toMatchObject({
          tipo: 'VIAGEM_AGENDADA', titulo: 'Viagem agendada', severidade: 'info', operacao: 'Administrativo',
          referencia_tipo: 'VIAGEM_FROTA', referencia_id: 108, url_destino: '/viagens', lida_em: null,
          chave_idempotencia: 'VIAGEM_AGENDADA:VIAGEM_FROTA:108:v1',
        });
        expect(await umItem(id)).toMatchObject({
          notificacao_id: aviso.id, evento_tipo: 'VIAGEM_AGENDADA', categoria: 'VIAGENS', status: 'PENDENTE',
          tentativas: 0, ocorrencia_versao: 'v1',
          payload_push: { notificacao_id: aviso.id, titulo: 'Viagem agendada', corpo: 'Você tem uma viagem.', url: '/viagens', tag: 'viagem-108' },
        });
      }
    });

    it('diferencia reprogramações com o mesmo horário pela identidade da transição', async () => {
      const a = await usuario();
      for (const [id, horario] of [[101, '16:00'], [102, '15:00'], [103, '16:00']] as const) {
        const reprogramacao = evento([a], { tipo: 'VIAGEM_REAGENDADA', ocorrencia: String(id), mensagem: horario });
        expect(await publicar(reprogramacao)).toEqual({ criadas: 1 });
        expect(await publicar(reprogramacao)).toEqual({ criadas: 0 });
      }
      expect(await filaDe(a)).toHaveLength(3);
    });

    it('mantém o domínio sem publicação com a flag desligada', async () => {
      const a = await usuario();
      configNotificacoes.ativas = false;
      expect(await publicar(evento([a]))).toEqual({ criadas: 0 });
      expect(await avisosDe(a)).toHaveLength(0);
    });

    it('sem push, o aviso fica só no sistema', async () => {
      const a = await usuario();
      await publicar(evento([a], { push: undefined }));
      expect(await avisosDe(a)).toHaveLength(1);
      expect(await filaDe(a)).toHaveLength(0);
    });

    it('não avisa o autor, inativos nem quem não existe', async () => {
      const [autor, inativo, outro] = [await usuario(), await usuario({ ativo: false }), await usuario()];
      expect(await publicar(evento([autor, inativo, outro, 2147483647], { autorId: autor }))).toEqual({ criadas: 1 });
      expect(await avisosDe(autor)).toHaveLength(0);
      expect(await avisosDe(inativo)).toHaveLength(0);
      expect(await filaDe(autor)).toHaveLength(0);
      expect(await avisosDe(outro)).toHaveLength(1);
      expect(await publicar(evento([autor], { autorId: autor }))).toEqual({ criadas: 0 });
      expect(await publicar(evento([]))).toEqual({ criadas: 0 });
    });

    it('operação desfeita não deixa aviso nem push', async () => {
      const a = await usuario();
      await expect(db.transaction(async (trx) => {
        await publicarNotificacao(trx, evento([a]));
        throw new Error('operação falhou');
      })).rejects.toThrow('operação falhou');
      expect(await avisosDe(a)).toHaveLength(0);
      expect(await filaDe(a)).toHaveLength(0);
    });

    it('falha na pendência de push desfaz também o aviso', async () => {
      const a = await usuario();
      await expect(publicar(evento([a], {
        push: { categoria: 'X'.repeat(61), titulo: 't', corpo: 'c' },
      }))).rejects.toThrow();
      expect(await avisosDe(a)).toHaveLength(0);
    });

    it('exige a transação da operação', async () => {
      const a = await usuario();
      await expect(publicarNotificacao(db as never, evento([a]))).rejects.toThrow('exige a transação');
      expect(await avisosDe(a)).toHaveLength(0);
    });

    it('repetir não duplica; outra ocorrência, outro registro e outro evento avisam de novo', async () => {
      const a = await usuario();
      await publicar(evento([a]));
      expect(await publicar(evento([a], { titulo: 'Outro texto' }))).toEqual({ criadas: 0 });
      expect(await filaDe(a)).toHaveLength(1);

      await publicar(evento([a], { ocorrencia: 'v2' }));
      await publicar(evento([a], { referencia: { tipo: 'VIAGEM_FROTA', id: 109 } }));
      await publicar(evento([a], { operacao: 'SVO', referencia: { tipo: 'ORDEM_SVO', id: 108 } }));
      await publicar(evento([a], { tipo: 'VIAGEM_CANCELADA' }));
      await publicar(evento([a], { referencia: undefined }));
      expect(await avisosDe(a)).toHaveLength(6);
      expect(await filaDe(a)).toHaveLength(6);
    });

    it('destinatário em dois grupos do mesmo evento recebe um aviso só', async () => {
      const a = await usuario();
      await db.transaction(async (trx) => {
        await publicarNotificacao(trx, evento([a], { push: undefined }));
        await publicarNotificacao(trx, evento([a], { urlDestino: '/solicitacoes' }));
      });
      const avisos = await avisosDe(a);
      expect(avisos).toHaveLength(1);
      expect(await umItem(a)).toMatchObject({ notificacao_id: avisos[0].id });
    });

    it('publicações simultâneas do mesmo evento, em ordens diferentes, gravam uma vez e sem deadlock', async () => {
      const ids = [await usuario(), await usuario(), await usuario(), await usuario()];
      const resultados = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        publicar(evento(i % 2 ? ids : [...ids].reverse()))));
      expect(resultados.reduce((soma, r) => soma + r.criadas, 0)).toBe(4);
      for (const id of ids) {
        expect(await avisosDe(id)).toHaveLength(1);
        expect(await filaDe(id)).toHaveLength(1);
      }
    });

    it('grava sempre na ordem do usuário', async () => {
      const ids: number[] = [];
      for (let i = 0; i < 7; i += 1) ids.push(await usuario());
      const chave = 'VIAGEM_AGENDADA:VIAGEM_FROTA:108:v1';
      const direto = (usuario_id: number) => ({
        usuario_id, tipo: 'T', titulo: 't', mensagem: 'm', operacao: 'SVO', url_destino: '/x', chave_idempotencia: chave,
      });
      let publicacao: Promise<unknown> | undefined;
      await db.transaction(async (trx) => {
        await trx('notificacoes').insert(direto(ids[0]!));
        // O knex só inicia a transação quando alguém a espera
        publicacao = publicar(evento([...ids].reverse())).then((r) => r);
        await new Promise((r) => setTimeout(r, 300));
        // Quem espera pelo primeiro ainda não pode ter gravado nenhum dos outros
        await trx.raw("SET LOCAL lock_timeout = '1s'");
        await trx('notificacoes').insert(ids.slice(1).map(direto));
      });
      await expect(publicacao).resolves.toEqual({ criadas: 0 });
    });

    it('corta os textos no limite, sem partir caracteres', async () => {
      const a = await usuario();
      await publicar(evento([a], {
        titulo: '🚗'.repeat(130), mensagem: 'á'.repeat(300), push: { categoria: 'VIAGENS', titulo: '🚗'.repeat(50), corpo: 'b'.repeat(120) },
      }));
      const [aviso] = await avisosDe(a);
      expect(aviso.titulo).toBe(`${'🚗'.repeat(119)}…`);
      expect([...aviso.mensagem]).toHaveLength(280);
      const { payload_push } = await umItem(a);
      expect(payload_push.titulo).toBe(`${'🚗'.repeat(44)}…`);
      expect(payload_push.corpo).toHaveLength(110);
      expect(payload_push).not.toHaveProperty('tag');
    });

    it('a ocorrência tem limite, e a chave sempre cabe na coluna', async () => {
      const a = await usuario();
      for (const ocorrencia of ['', '  ', 'x'.repeat(61)]) {
        await expect(publicar(evento([a], { ocorrencia }))).rejects.toThrow('A ocorrência');
      }
      await publicar(evento([a], {
        tipo: 'T'.repeat(64), referencia: { tipo: 'VIAGEM_FROTA', id: 2147483647 }, ocorrencia: 'x'.repeat(60),
      }));
      expect(await filaDe(a)).toHaveLength(1);
    });

    it('destino externo é recusado pelo banco e nada fica', async () => {
      const a = await usuario();
      await expect(publicar(evento([a], { urlDestino: 'https://externo.exemplo' }))).rejects.toThrow();
      expect(await avisosDe(a)).toHaveLength(0);
    });
  });

  describe('Depois do commit', () => {
    const enviador = vi.fn<EnviadorPush>();
    beforeEach(() => { enviador.mockReset().mockResolvedValue({ status: 201 }); });

    it('envia sozinho, e só depois do commit', async () => {
      const a = await usuario();
      const [endpoint] = await ligarPush(a);
      definirEnviadorPush(enviador);
      await db.transaction(async (trx) => {
        await publicarNotificacao(trx, evento([a]));
        await new Promise((r) => setTimeout(r, 200));
        expect(enviador).not.toHaveBeenCalled();
      });
      await vi.waitFor(async () => expect(await umItem(a)).toMatchObject({ status: 'ENVIADO' }));
      expect(enviador).toHaveBeenCalledOnce();
      expect(enviador.mock.calls[0]![0].endpoint).toBe(endpoint);
    });

    it('com savepoint, espera o commit de fora', async () => {
      const a = await usuario();
      await ligarPush(a);
      definirEnviadorPush(enviador);
      await db.transaction(async (trx) => {
        await trx.transaction((dentro) => publicarNotificacao(dentro, evento([a])));
        await new Promise((r) => setTimeout(r, 200));
      });
      await vi.waitFor(async () => expect(await umItem(a)).toMatchObject({ status: 'ENVIADO' }));
    });

    it('push com falha não afeta a operação nem o aviso', async () => {
      const a = await usuario();
      await ligarPush(a);
      enviador.mockRejectedValue(new Error('sem rede'));
      definirEnviadorPush(enviador);
      await expect(publicar(evento([a]))).resolves.toEqual({ criadas: 1 });
      await vi.waitFor(async () => expect(await umItem(a)).toMatchObject({ status: 'PENDENTE', ultimo_erro: 'REDE' }));
      expect(await avisosDe(a)).toHaveLength(1);
    });

    it('ao ligar, retoma o que uma parada deixou', async () => {
      const [pendente, interrompido] = [await usuario(), await usuario()];
      for (const id of [pendente, interrompido]) {
        await ligarPush(id);
        await publicar(evento([id]));
      }
      await db('notificacao_outbox').where({ usuario_id: interrompido }).update({
        status: 'PROCESSANDO', tentativas: 1, bloqueado_ate: db.raw("clock_timestamp() - interval '1 second'"),
      });
      definirEnviadorPush(enviador);
      await vi.waitFor(async () => {
        expect(await umItem(pendente)).toMatchObject({ status: 'ENVIADO', tentativas: 1 });
        expect(await umItem(interrompido)).toMatchObject({ status: 'ENVIADO', tentativas: 2 });
      });
    });
  });

  describe('Fila', () => {
    const enviador = vi.fn<EnviadorPush>();
    beforeEach(() => { enviador.mockReset().mockResolvedValue({ status: 201 }); });

    it('processos simultâneos nunca enviam o mesmo item', async () => {
      const ids: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const id = await usuario();
        await ligarPush(id);
        ids.push(id);
      }
      await publicar(evento(ids));
      enviador.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { status: 201 };
      });
      await Promise.all([1, 2, 3, 4].map(() => processarFilaPush(enviador)));
      const endpoints = enviador.mock.calls.map(([a]) => a.endpoint);
      expect(endpoints).toHaveLength(12);
      expect(new Set(endpoints).size).toBe(12);
    });

    it('reserva vencida volta para a fila, e quem a perdeu não sobrescreve o resultado', async () => {
      const a = await usuario();
      await ligarPush(a);
      await publicar(evento([a]));
      const [antiga] = await notificacaoOutboxModel.reservar(5, 120, 24);
      expect(await notificacaoOutboxModel.reservar(5, 120, 24)).toEqual([]);

      await db('notificacao_outbox').where({ usuario_id: a }).update({ bloqueado_ate: db.raw("clock_timestamp() - interval '1 second'") });
      const [nova] = await notificacaoOutboxModel.reservar(5, 120, 24);
      expect(nova).toMatchObject({ id: antiga!.id, tentativas: 2 });
      expect(await notificacaoOutboxModel.concluir(antiga!, { status: 'FALHA_DEFINITIVA', erro: 'HTTP_400', statusHttp: 400 })).toBe(false);
      expect(await notificacaoOutboxModel.concluir(nova!, { status: 'ENVIADO' })).toBe(true);
      expect(await notificacaoOutboxModel.concluir(nova!, { status: 'ENVIADO' })).toBe(false);
      expect(await umItem(a)).toMatchObject({ status: 'ENVIADO', ultimo_erro: null });
    });

    it('item que derruba o processo em todas as tentativas é encerrado', async () => {
      const a = await usuario();
      await publicar(evento([a]));
      await db('notificacao_outbox').where({ usuario_id: a }).update({
        status: 'PROCESSANDO', tentativas: 5, bloqueado_ate: db.raw("clock_timestamp() - interval '1 second'"),
      });
      await processarFilaPush(enviador);
      expect(await umItem(a)).toMatchObject({ status: 'FALHA_DEFINITIVA', ultimo_erro: 'PROCESSO_INTERROMPIDO', bloqueado_ate: null });
      expect(enviador).not.toHaveBeenCalled();
    });

    it('alerta com mais de 24 horas não é enviado; o aviso continua', async () => {
      const a = await usuario();
      await ligarPush(a);
      await publicar(evento([a]));
      await db('notificacao_outbox').where({ usuario_id: a }).update({ criado_em: db.raw("clock_timestamp() - interval '25 hours'") });
      expect(await notificacaoOutboxModel.reservar(5, 120, 24)).toEqual([]);
      await processarFilaPush(enviador);
      expect(enviador).not.toHaveBeenCalled();
      expect(await umItem(a)).toMatchObject({ status: 'IGNORADO', ultimo_erro: 'PRAZO_ENCERRADO' });
      expect(await avisosDe(a)).toHaveLength(1);
    });

    it('503 adia, respeita a espera e entrega na tentativa seguinte', async () => {
      const a = await usuario();
      await ligarPush(a);
      await publicar(evento([a]));
      enviador.mockResolvedValueOnce({ status: 503 });
      await processarFilaPush(enviador);
      expect(await umItem(a)).toMatchObject({
        status: 'PENDENTE', tentativas: 1, ultimo_erro: 'HTTP_503', ultimo_status_http: 503, bloqueado_ate: null, processado_em: null,
      });
      const espera = await notificacaoOutboxModel.esperaAteProximo();
      expect(espera).toBeGreaterThan(25_000);
      expect(espera).toBeLessThanOrEqual(36_000);

      await processarFilaPush(enviador);
      expect(enviador).toHaveBeenCalledOnce();
      await vencerEspera(a);
      await processarFilaPush(enviador);
      expect(await umItem(a)).toMatchObject({ status: 'ENVIADO', tentativas: 2 });
      expect(await notificacaoOutboxModel.esperaAteProximo()).toBeNull();
      const [assinatura] = await db('push_subscriptions').where({ usuario_id: a });
      expect(assinatura).toMatchObject({ ativa: true, falhas_consecutivas: 0, ultimo_status_http: 201 });
    });

    it('a nova tentativa repete apenas no aparelho que respondeu 429', async () => {
      const a = await usuario();
      const [um, dois, tres] = await ligarPush(a, 3);
      await publicar(evento([a]));
      enviador.mockImplementation(async ({ endpoint }) => ({ status: endpoint === dois ? 429 : endpoint === tres ? 400 : 201 }));
      await processarFilaPush(enviador);
      await vencerEspera(a);
      enviador.mockReset().mockResolvedValue({ status: 201 });
      await processarFilaPush(enviador);
      expect(enviador.mock.calls.map(([x]) => x.endpoint)).toEqual([dois]);
      expect(enviador.mock.calls[0]![1]).not.toHaveProperty('entregues');
      expect(um).not.toBe(dois);
      expect(enviador.mock.calls[0]![1]).not.toHaveProperty('definitivas');
      expect(await umItem(a)).toMatchObject({ status: 'ENVIADO', ultimo_erro: 'ENTREGA_PARCIAL' });
    });

    it('revalida o perfil depois de enfileirar e antes de entregar', async () => {
      const a = await usuario();
      await ligarPush(a);
      await publicar(evento([a]));
      await db('usuarios').where({ id: a }).update({ perfil: 'MOTORISTA_SVO', tipo_usuario: 'MOTORISTA' });
      await processarFilaPush(enviador);
      expect(enviador).not.toHaveBeenCalled();
      expect(await umItem(a)).toMatchObject({ status: 'IGNORADO', ultimo_erro: 'ACESSO_REVOGADO' });
    });

    it('preserva a entrega parcial quando o prazo do retry vence', async () => {
      const a = await usuario();
      const [, temporaria] = await ligarPush(a, 2);
      await publicar(evento([a]));
      enviador.mockImplementation(async ({ endpoint }) => ({ status: endpoint === temporaria ? 429 : 201 }));
      await processarFilaPush(enviador);
      await db('notificacao_outbox').where({ usuario_id: a })
        .update({ criado_em: db.raw("clock_timestamp() - interval '25 hours'") });
      await processarFilaPush(enviador);
      expect(await umItem(a)).toMatchObject({ status: 'ENVIADO', ultimo_erro: 'ENTREGA_PARCIAL' });
      expect(enviador).toHaveBeenCalledTimes(2);
    });

    it('não envia a assinatura encerrada', async () => {
      const a = await usuario();
      const [encerrada, viva] = await ligarPush(a, 2);
      await db('push_subscriptions').where({ endpoint: encerrada }).update({ status: 'REVOGADA', ativa: false, revogada_em: db.fn.now() });
      await publicar(evento([a]));
      await processarFilaPush(enviador);
      expect(enviador.mock.calls.map(([x]) => x.endpoint)).toEqual([viva]);
    });

    it('a próxima execução considera a reserva de um processo que pode ter caído', async () => {
      const a = await usuario();
      await publicar(evento([a]));
      await notificacaoOutboxModel.reservar(5, 120, 24);
      const espera = await notificacaoOutboxModel.esperaAteProximo();
      expect(espera).toBeGreaterThan(100_000);
      expect(espera).toBeLessThanOrEqual(120_000);
    });

    it('410 encerra só aquela assinatura', async () => {
      const a = await usuario();
      const [morta, viva] = await ligarPush(a, 2);
      await publicar(evento([a]));
      enviador.mockImplementation(async ({ endpoint }) => ({ status: endpoint === morta ? 410 : 201 }));
      await processarFilaPush(enviador);
      const situacao = Object.fromEntries((await db('push_subscriptions').where({ usuario_id: a })).map((s) => [s.endpoint, s]));
      expect(situacao[morta!]).toMatchObject({ status: 'EXPIRADA', ativa: false, ultimo_status_http: 410 });
      expect(situacao[morta!].expirada_em).not.toBeNull();
      expect(situacao[viva!]).toMatchObject({ status: 'ATIVA', ativa: true });
      expect(await umItem(a)).toMatchObject({ status: 'ENVIADO' });
    });

    it('410 de um envio antigo não encerra a assinatura refeita com outras chaves', async () => {
      const a = await usuario();
      const [endpoint] = await ligarPush(a);
      await publicar(evento([a]));
      enviador.mockImplementationOnce(async () => {
        await db('push_subscriptions').where({ endpoint }).update({ p256dh: `${nonce()}${nonce()}`, auth: nonce() });
        return { status: 410 };
      });
      await processarFilaPush(enviador);
      expect(await db('push_subscriptions').where({ endpoint }).first()).toMatchObject({ status: 'ATIVA', ativa: true });
    });

    it('as escolhas valem na hora do envio', async () => {
      const semEscolha = await usuario();
      const [desligou, inativo, semAparelho] = [await usuario(), await usuario(), await usuario()];
      await db('push_subscriptions').insert({ usuario_id: semEscolha, endpoint: `https://push.exemplo/${nonce()}`, p256dh: `${nonce()}${nonce()}`, auth: nonce() });
      for (const id of [desligou, inativo]) await ligarPush(id);
      await ligarPush(semAparelho, 0);
      await publicar(evento([semEscolha, desligou, inativo, semAparelho]));
      await db('preferencias_notificacao').where({ usuario_id: desligou }).update({ habilitado: false });
      await db('usuarios').where({ id: inativo }).update({ ativo: false });

      await processarFilaPush(enviador);
      expect(enviador).not.toHaveBeenCalled();
      const motivos = await Promise.all([semEscolha, desligou, inativo, semAparelho].map(umItem));
      expect(motivos.map((m) => [m.status, m.ultimo_erro])).toEqual([
        ['IGNORADO', 'CATEGORIA_DESLIGADA'], ['IGNORADO', 'CATEGORIA_DESLIGADA'],
        ['IGNORADO', 'USUARIO_INATIVO'], ['IGNORADO', 'SEM_ASSINATURA'],
      ]);
    });

    it('com o usuário acima do limite de aparelhos, o banco recusa a anotação e o alerta não se repete', async () => {
      const a = await usuario();
      await ligarPush(a, 5);
      // Sexto aparelho, como se o limite tivesse sido reduzido depois
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL session_replication_role = replica');
        await trx('push_subscriptions').insert({ usuario_id: a, endpoint: `https://push.exemplo/${nonce()}`, p256dh: `${nonce()}${nonce()}`, auth: nonce() });
      });
      const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await publicar(evento([a]));
      await processarFilaPush(enviador);
      expect(erros.mock.calls.join()).toContain('PUSH_REGISTRO_ASSINATURA_FALHOU');
      expect(await umItem(a)).toMatchObject({ status: 'ENVIADO' });
      expect(enviador).toHaveBeenCalledTimes(6);
    });
  });
});
