import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { configNotificacoes } from '../config/notificacoes';
import { db } from '../config/database';
import { env } from '../config/env';

// Acesso ao registro de origem do aviso (SCRUM-226), conferido a cada leitura. Só executa num banco descartável
// explicitamente identificado, depois de `npm run migrate`.
const habilitado = process.env.SCRUM226_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(8).toString('hex');

interface Conta { id: number; token: string }

async function conta(perfil: string): Promise<Conta> {
  const [u] = await db('usuarios').insert({
    nome: 'Teste', email: `${nonce()}@testes.invalid`, senha: 'hash-de-teste', perfil,
    tipo_usuario: perfil.startsWith('MOTORISTA_') ? 'MOTORISTA' : perfil,
  }).returning(['id', 'versao_sessao']);
  if (perfil === 'GESTOR_SVO') {
    const unidade = await db('unidades').where({ nome: 'SVO' }).first('id');
    await db('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: u.id });
  }
  const token = jwt.sign(
    { typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret,
    { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800 },
  );
  return { id: u.id, token: `Bearer ${token}` };
}

async function motorista(perfil: 'MOTORISTA_FROTA' | 'MOTORISTA_SVO') {
  const u = await conta(perfil);
  const [m] = await db('motoristas').insert({
    usuario_id: u.id, numero_cnh: nonce(), categoria_cnh: 'B', validade_cnh: '2099-12-31',
    tipo_motorista: perfil === 'MOTORISTA_SVO' ? 'SVO' : 'FROTA',
  }).returning('id');
  return { ...u, motoristaId: m.id as number };
}

async function solicitacao(u: Conta): Promise<number> {
  const [s] = await db('solicitacoes_viagem').insert({
    solicitante_id: u.id, origem: 'Sede', destino: 'Hospital', finalidade: 'Teste',
    data_saida_desejada: '2099-01-01T10:00:00Z', status: 'AGENDADA',
  }).returning('id');
  return s.id;
}

async function viagem(solicitacao_id: number, motorista_id: number | null = null): Promise<number> {
  const [v] = await db('viagens_frota').insert({ solicitacao_id, motorista_id, status: 'AGENDADA' }).returning('id');
  return v.id;
}

async function ordem(motorista_id: number | null = null): Promise<number> {
  const [o] = await db('ordens_svo').insert({ motorista_id, status: motorista_id === null ? 'AGUARDANDO_ALOCACAO' : 'CANCELADA' }).returning('id');
  return o.id;
}

async function designar(ordem_id: number, u: Conta, gestor: Conta): Promise<void> {
  const [equipe] = await db('equipes_svo').insert({ nome_equipe: `Equipe ${nonce()}` }).returning('id');
  await db('ordens_svo_integrantes').insert({ ordem_id, equipe_id: equipe.id, usuario_id: u.id, designado_por: gestor.id });
}

const revogar = (ordem_id: number, u: Conta, gestor: Conta) =>
  db('ordens_svo_integrantes').where({ ordem_id, usuario_id: u.id }).whereNull('revogado_em')
    .update({ revogado_em: db.raw('clock_timestamp()'), revogado_por: gestor.id });

async function avisar(u: Conta, dados: Record<string, unknown> = {}): Promise<number> {
  const [linha] = await db('notificacoes').insert({
    usuario_id: u.id, tipo: 'TIPO_DO_EVENTO', titulo: 'Título original', mensagem: 'Texto original', severidade: 'danger',
    operacao: 'Administrativo', url_destino: '/viagens', chave_idempotencia: nonce(), ...dados,
  }).returning('id');
  return linha.id;
}

const naSolicitacao = (id: number) => ({ referencia_tipo: 'SOLICITACAO_VIAGEM', referencia_id: id });
const naViagem = (id: number) => ({ referencia_tipo: 'VIAGEM_FROTA', referencia_id: id });
const naOrdem = (id: number) => ({ operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: id });
const naSolicitacaoSvo = (id: number) => ({ operacao: 'SVO', referencia_tipo: 'SOLICITACAO_SVO', referencia_id: id });

const listar = (u: Conta) => request(app).get('/api/notificacoes').set('Authorization', u.token);
const ver = async (u: Conta) => (await listar(u)).body.itens;

const INTEIRO = { titulo: 'Título original', mensagem: 'Texto original', acesso_revogado: false };
const REVOGADO = {
  titulo: 'Registro indisponível', mensagem: 'Você não tem mais acesso a este registro.', severidade: 'info',
  referencia_tipo: null, referencia_id: null, url_destino: '/', acesso_revogado: true,
};

describe.skipIf(!habilitado)('Acesso ao registro do aviso em PostgreSQL descartável', () => {
  let gestor: Conta;
  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
    gestor = await conta('ADMINISTRADOR');
  });
  afterAll(() => db.destroy());

  it('integrante removido da coleta perde o conteúdo; o que continua designado, não', async () => {
    const [removido, mantido] = [await conta('INTEGRANTE_SVO'), await conta('INTEGRANTE_SVO')];
    const id = await ordem();
    for (const u of [removido, mantido]) {
      await designar(id, u, gestor);
      await avisar(u, { ...naOrdem(id), url_destino: '/minhas-coletas' });
    }
    expect((await ver(removido))[0]).toMatchObject(INTEIRO);
    await revogar(id, removido, gestor);

    const res = await listar(removido);
    expect(res.body.itens[0]).toMatchObject({ ...REVOGADO, tipo: 'TIPO_DO_EVENTO', lida_em: null });
    expect(res.text).not.toMatch(/original|minhas-coletas/);
    expect((await ver(mantido))[0]).toMatchObject({ ...INTEIRO, referencia_id: id });
  });

  it('revalida titularidade e designação antes de devolver o aviso para abertura', async () => {
    const [titular, outra] = [await conta('INTEGRANTE_SVO'), await conta('INTEGRANTE_SVO')];
    const id = await ordem();
    await designar(id, titular, gestor);
    await designar(id, outra, gestor);
    const aviso = await avisar(titular, naOrdem(id));
    const obter = (u: Conta) => request(app).get(`/api/notificacoes/${aviso}`).set('Authorization', u.token);
    const anterior = configNotificacoes.ativas;
    configNotificacoes.ativas = true;
    try {
      expect((await obter(titular)).body).toMatchObject({ ...INTEIRO, id: aviso, lida_em: null });
      expect((await obter(titular)).headers['cache-control']).toBe('no-store');
      expect((await obter(outra)).status).toBe(404);
      await revogar(id, titular, gestor);
      expect((await obter(titular)).status).toBe(404);
      configNotificacoes.ativas = false;
      expect((await obter(titular)).status).toBe(404);
    } finally {
      configNotificacoes.ativas = anterior;
    }
  });

  it('designado de novo, volta a ver', async () => {
    const u = await conta('INTEGRANTE_SVO');
    const id = await ordem();
    await designar(id, u, gestor);
    await avisar(u, naOrdem(id));
    await revogar(id, u, gestor);
    expect((await ver(u))[0]).toMatchObject(REVOGADO);
    await designar(id, u, gestor);
    expect((await ver(u))[0]).toMatchObject(INTEIRO);
  });

  it('coleta cancelada continua no histórico de quem participou', async () => {
    const u = await conta('INTEGRANTE_SVO');
    const id = await ordem();
    await designar(id, u, gestor);
    await avisar(u, naOrdem(id));
    await db('ordens_svo').where({ id }).update({ status: 'CANCELADA' });
    expect((await ver(u))[0]).toMatchObject(INTEIRO);
  });

  it('a designação de outra pessoa ou de outra coleta não serve', async () => {
    const [u, outra] = [await conta('INTEGRANTE_SVO'), await conta('INTEGRANTE_SVO')];
    const [minha, dela] = [await ordem(), await ordem()];
    await designar(minha, u, gestor);
    await designar(dela, outra, gestor);
    await avisar(u, naOrdem(dela));
    expect((await ver(u))[0]).toMatchObject(REVOGADO);
  });

  it('aviso sem conteúdo continua contado e pode ser marcado, sem devolver o conteúdo', async () => {
    const u = await conta('INTEGRANTE_SVO');
    const aviso = await avisar(u, naOrdem(await ordem()));
    expect((await listar(u)).body).toMatchObject({ nao_lidas: 1, itens: [REVOGADO] });
    const { body } = await request(app).patch(`/api/notificacoes/${aviso}/lida`).set('Authorization', u.token);
    expect(body).toMatchObject({ id: aviso, nao_lidas: 0 });
    expect(Object.keys(body).sort()).toEqual(['id', 'lida_em', 'nao_lidas', 'versao']);
  });

  it('motorista da frota: só enquanto conduz', async () => {
    const [antes, depois] = [await motorista('MOTORISTA_FROTA'), await motorista('MOTORISTA_FROTA')];
    const id = await viagem(await solicitacao(gestor), antes.motoristaId);
    for (const u of [antes, depois]) await avisar(u, naViagem(id));
    expect((await ver(antes))[0]).toMatchObject(INTEIRO);
    expect((await ver(depois))[0]).toMatchObject(REVOGADO);
    await db('viagens_frota').where({ id }).update({ motorista_id: depois.motoristaId });
    expect((await ver(antes))[0]).toMatchObject(REVOGADO);
    expect((await ver(depois))[0]).toMatchObject(INTEIRO);
  });

  it('motorista SVO: só da própria coleta', async () => {
    const [meu, outro] = [await motorista('MOTORISTA_SVO'), await motorista('MOTORISTA_SVO')];
    const id = await ordem(meu.motoristaId);
    for (const u of [meu, outro]) await avisar(u, naOrdem(id));
    expect((await ver(meu))[0]).toMatchObject(INTEIRO);
    expect((await ver(outro))[0]).toMatchObject(REVOGADO);
  });

  it.each(['SOLICITANTE', 'GESTOR_SVO'])('%s: só o que pediu, na solicitação e na viagem', async (perfil) => {
    const [autor, outro] = [await conta(perfil), await conta(perfil)];
    const pedido = await solicitacao(autor);
    const id = await viagem(pedido);
    for (const u of [autor, outro]) {
      await avisar(u, naSolicitacao(pedido));
      await avisar(u, naViagem(id));
    }
    expect(await ver(autor)).toMatchObject([INTEIRO, INTEIRO]);
    expect(await ver(outro)).toMatchObject([REVOGADO, REVOGADO]);
  });

  it('gestão vê os registros da própria operação', async () => {
    const pedido = await solicitacao(gestor);
    const [id, coleta] = [await viagem(pedido), await ordem()];
    const casos: [string, Record<string, unknown>[]][] = [
      ['GESTOR_FROTA', [naSolicitacao(pedido), naViagem(id)]],
      ['GESTOR_SVO', [naSolicitacaoSvo(1), naOrdem(coleta)]],
      ['ADMINISTRADOR', [naSolicitacao(pedido), naViagem(id), naSolicitacaoSvo(1), naOrdem(coleta)]],
    ];
    for (const [perfil, avisos] of casos) {
      const u = await conta(perfil);
      for (const aviso of avisos) await avisar(u, aviso);
      expect(await ver(u), perfil).toMatchObject(avisos.map(() => INTEIRO));
    }
  });

  it('chamado SVO não é acessado por motorista nem integrante', async () => {
    for (const u of [await motorista('MOTORISTA_SVO'), await conta('INTEGRANTE_SVO')]) {
      await avisar(u, naSolicitacaoSvo(1));
      expect((await ver(u))[0]).toMatchObject(REVOGADO);
    }
  });

  it('perfil trocado na mesma operação perde o que era da função anterior', async () => {
    const u = await motorista('MOTORISTA_SVO');
    await avisar(u, naOrdem(await ordem(u.motoristaId)));
    expect((await ver(u))[0]).toMatchObject(INTEIRO);
    await db('usuarios').where({ id: u.id }).update({ perfil: 'INTEGRANTE_SVO', tipo_usuario: 'INTEGRANTE_SVO' });
    expect((await ver(u))[0]).toMatchObject(REVOGADO);
  });

  it('a referência de outra operação não dá acesso, nem ao Administrador', async () => {
    const id = await viagem(await solicitacao(gestor));
    const u = await conta('ADMINISTRADOR');
    await avisar(u, { ...naViagem(id), operacao: 'SVO' });
    expect((await ver(u))[0]).toMatchObject(REVOGADO);
  });

  it('sem registro de origem é livre; tipo desconhecido não, nem para o Administrador', async () => {
    const u = await conta('ADMINISTRADOR');
    await avisar(u, { referencia_tipo: 'TIPO_NOVO', referencia_id: 1, criado_em: '2026-01-01T00:00:00Z' });
    await avisar(u, { criado_em: '2026-01-02T00:00:00Z' });
    expect(await ver(u)).toMatchObject([INTEIRO, REVOGADO]);
  });
});
