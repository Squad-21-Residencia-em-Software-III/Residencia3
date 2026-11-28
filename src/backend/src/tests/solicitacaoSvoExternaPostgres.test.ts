import { acompanhamentoExternoSvoModel } from '../models/acompanhamentoExternoSvoModel';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import knex, { type Knex } from 'knex';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { carregarRecursosOperacionais } from '../config/recursosOperacionais';
import { configNotificacoes } from '../config/notificacoes';
import { acompanhamentoExternoSvoService, calcularDigestCredencialExterna } from '../services/acompanhamentoExternoSvoService';
import { EVENTO_SVO_S1, notificacaoSvoService } from '../services/notificacaoSvoService';
import { solicitacaoSvoExternaService } from '../services/solicitacaoSvoExternaService';
import { solicitacaoSvoExternaSchema } from '../validators/solicitacaoSvoExternaSchemas';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// SCRUM-264 de ponta a ponta por HTTP e PostgreSQL: criação pública, transação, idempotência, concorrência,
// rollback, resposta perdida e compatibilidade REAL com a SCRUM-266 (credencial, recuperação e consulta pública).
// A aplicação usa a role restrita POSTGRES_APP_USER (provado por current_user); fixtures e verificações de
// privilégio usam outra conexão, administrativa. Só roda num banco descartável explicitamente identificado, depois de
// `npm run migrate`. Todos os dados são sintéticos.
const habilitado = process.env.ENDPOINT_PUBLICO_SVO_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(4).toString('hex');
const URL_EXTERNA = '/api/solicitacoes-svo/externas';

interface Conta { id: number; token: string }

async function conta(admin: Knex, perfil: 'ADMINISTRADOR' | 'GESTOR_SVO' | 'SOLICITANTE' | 'MOTORISTA_SVO' | 'INTEGRANTE_SVO', ativo = true): Promise<Conta> {
  const chave = nonce();
  const [u] = await admin('usuarios').insert({
    nome: `Teste ${chave}`, email: `${chave}@testes.invalid`, senha: 'hash-de-teste', perfil, ativo,
    tipo_usuario: perfil === 'MOTORISTA_SVO' ? 'MOTORISTA' : perfil,
  }).returning('*');
  if (perfil === 'GESTOR_SVO') {
    const unidade = await admin('unidades').where({ nome: 'SVO' }).first('id');
    await admin('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: u.id });
  }
  const agora = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: agora + 3600 }, env.jwtSecret, {
    algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800,
  });
  return { id: u.id, token: `Bearer ${token}` };
}

const corpo = (extra: Record<string, unknown> = {}) => ({
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
  ...extra,
});

const tentativa = () => ({ chave: `tentativa-${nonce()}${nonce()}`, prova: `${nonce()}${nonce()}`.repeat(4) });

const enviar = (dados: unknown, t: { chave: string; prova: string }) =>
  request(app).post(URL_EXTERNA).set({ 'Idempotency-Key': t.chave, 'X-Prova-Tentativa': t.prova }).send(dados as object);

const contarExternas = async (): Promise<number> =>
  Number((await db('solicitacoes_svo').where({ canal_origem: 'EXTERNA' }).count({ total: '*' }).first())?.total ?? 0);
const contarAuditoriasExternas = async (): Promise<number> =>
  Number((await db('auditorias').where('acao', 'like', 'CRIOU_SOLICITACAO_SVO_EXTERNA%').count({ total: '*' }).first())?.total ?? 0);
const solicitacaoPorProtocolo = (protocolo: string) => db('solicitacoes_svo').where({ protocolo }).first();

// Mesma regra de quem recebe o S1: administradores ativos e gestores SVO ativos associados à unidade SVO
async function audienciaEsperada(): Promise<number[]> {
  return db('usuarios as u')
    .leftJoin('gestores_unidades as gu', 'gu.usuario_id', 'u.id')
    .leftJoin('unidades as un', function () { this.on('un.id', '=', 'gu.unidade_id').andOnVal('un.nome', '=', 'SVO'); })
    .where('u.ativo', true)
    .andWhere(function () {
      this.where('u.perfil', 'ADMINISTRADOR').orWhere(function () { this.where('u.perfil', 'GESTOR_SVO').whereNotNull('un.id'); });
    })
    .distinct().orderBy('u.id').pluck('u.id');
}

const avisosS1 = (id: number) =>
  db('notificacoes').where({ referencia_tipo: 'SOLICITACAO_SVO', referencia_id: id, tipo: EVENTO_SVO_S1 }).orderBy('usuario_id');

describe.skipIf(!habilitado)('Solicitação SVO externa em PostgreSQL descartável (SCRUM-264)', () => {
  let administrador: Conta, gestorSvo: Conta;
  let administradorInativo: Conta, solicitante: Conta;
  let admin: Knex;
  const criadas: number[] = [];
  usarBancoComExclusividade();

  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
    if (!process.env.POSTGRES_APP_USER) {
      throw new Error('A suíte exige POSTGRES_APP_USER: a aplicação precisa rodar com a role restrita (npm run db:provisionar-app-user)');
    }
    admin = knex({
      client: 'pg',
      pool: { min: 0, max: 1 },
      connection: {
        host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_MIGRATION_USER || process.env.POSTGRES_USER,
        password: process.env.POSTGRES_MIGRATION_PASSWORD || process.env.POSTGRES_PASSWORD,
      },
    });
    administrador = await conta(admin, 'ADMINISTRADOR');
    gestorSvo = await conta(admin, 'GESTOR_SVO');
    administradorInativo = await conta(admin, 'ADMINISTRADOR', false);
    solicitante = await conta(admin, 'SOLICITANTE');
  }, 60_000);

  const rolesDoPortal = { PORTAL_SVO_ATIVO: 'true', ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true' };

  beforeEach(async () => {
    await db('limites_portal_svo').delete();
    env.recursosOperacionais = carregarRecursosOperacionais(rolesDoPortal);
    configNotificacoes.ativas = true;
  });

  afterEach(() => {
    configNotificacoes.ativas = false;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // Limpeza best-effort do que esta suíte criou, para não interferir nas outras suítes
    for (const comando of [
      (ids: number[]) => admin('notificacao_outbox').where({ referencia_tipo: 'SOLICITACAO_SVO' }).whereIn('referencia_id', ids).delete(),
      (ids: number[]) => admin('notificacoes').where({ referencia_tipo: 'SOLICITACAO_SVO' }).whereIn('referencia_id', ids).delete(),
      (ids: number[]) => admin('solicitacoes_svo_recuperacoes_tentativa').whereIn('solicitacao_id', ids).delete(),
      (ids: number[]) => admin('solicitacoes_svo_credenciais_externas').whereIn('solicitacao_id', ids).delete(),
      (ids: number[]) => admin('solicitacoes_svo_dados_externos').whereIn('solicitacao_id', ids).delete(),
      (ids: number[]) => admin('solicitacoes_svo').whereIn('id', ids).delete(),
    ]) {
      try { if (criadas.length > 0) await comando(criadas); } catch { /* o banco é descartável */ }
    }
    await admin?.destroy();
    await db.destroy();
  });

  it('a aplicação roda com a role restrita: current_user, sem poderes administrativos e sem privilégios extras', async () => {
    const { rows: [atual] } = await db.raw('SELECT current_user AS role');
    const { rows: [administrativa] } = await admin.raw('SELECT current_user AS role');
    expect(atual.role).toBe(process.env.POSTGRES_APP_USER);
    expect(administrativa.role).not.toBe(atual.role);

    const { rows: [poderes] } = await admin.raw(
      `SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS admin FROM pg_roles WHERE rolname = ?`,
      [atual.role],
    );
    expect(poderes.admin).toBe(false);

    const { rows: [privilegios] } = await admin.raw(
      `SELECT has_table_privilege(?, 'solicitacoes_svo_credenciais_externas', 'DELETE') AS apaga,
              has_column_privilege(?, 'solicitacoes_svo_credenciais_externas', 'emitida_em', 'INSERT') AS grava_emitida_em,
              has_column_privilege(?, 'solicitacoes_svo_credenciais_externas', 'segredo_digest', 'UPDATE') AS altera_digest`,
      [atual.role, atual.role, atual.role],
    );
    // Privilégios mínimos: a emissão usa o padrão do banco para emitida_em e não há DELETE nem troca de digest
    expect(privilegios).toEqual({ apaga: false, grava_emitida_em: false, altera_digest: false });
  });

  it('sucesso: devolve o protocolo após o commit, grava tudo e aparece na fila', async () => {
    const t = tentativa();
    const antes = await contarExternas();
    const resposta = await enviar(corpo(), t);

    expect(resposta.status).toBe(201);
    expect(resposta.headers['cache-control']).toContain('no-store');
    expect(Object.keys(resposta.body).sort()).toEqual(['credencial', 'protocolo', 'registrada_em', 'status', 'status_label']);
    expect(resposta.body.protocolo).toMatch(/^SVO-[0-9]{8}-[A-Z0-9]{12}$/);
    expect(await contarExternas()).toBe(antes + 1);

    const s = await solicitacaoPorProtocolo(resposta.body.protocolo);
    criadas.push(s.id);
    expect(s).toMatchObject({
      canal_origem: 'EXTERNA', registrante_id: null, status: 'EM_TRIAGEM', material_sensivel: false,
      dados_solicitante: 'Solicitação externa', local_ocorrencia: 'Rua Ficticia dos Testes',
    });

    const dados = await db('solicitacoes_svo_dados_externos').where({ solicitacao_id: s.id }).first();
    expect(dados).toMatchObject({ cpf_solicitante: '52998224725', tipo_solicitante: 'PESSOA_FISICA', nome_instituicao: null });

    // Só digests: a credencial e a prova nunca ficam em texto claro
    const credencial = await db('solicitacoes_svo_credenciais_externas').where({ solicitacao_id: s.id }).first();
    expect(resposta.body.credencial).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(credencial.segredo_digest).toBe(
      calcularDigestCredencialExterna(resposta.body.credencial, credencial.algoritmo_digest, credencial.versao_credencial),
    );
    expect(credencial.algoritmo_digest).toBe('HMAC-SHA-256');
    expect(JSON.stringify(credencial)).not.toContain(resposta.body.credencial);
    expect(JSON.stringify(credencial)).not.toContain(t.prova);
    // Envelope de recuperação cifrado (AES-256-GCM da SCRUM-266): nada em texto claro, expira em 15 minutos
    const recuperacao = await db('solicitacoes_svo_recuperacoes_tentativa').where({ solicitacao_id: s.id }).first();
    expect(JSON.stringify(recuperacao)).not.toContain(resposta.body.credencial);
    expect(JSON.stringify(recuperacao)).not.toContain(resposta.body.protocolo);
    // Os dois prazos usam a mesma referência da emissão no banco.
    const janelaMs = new Date(recuperacao.expira_em).getTime() - new Date(credencial.emitida_em).getTime();
    expect(janelaMs).toBe(15 * 60 * 1000);

    // Na fila interna, sem dados pessoais
    const fila = await request(app).get('/api/solicitacoes-svo?status=EM_TRIAGEM&limite=100').set('Authorization', gestorSvo.token);
    expect(fila.status).toBe(200);
    const item = fila.body.dados.find((linha: { id: number }) => linha.id === s.id);
    expect(item).toMatchObject({ canal_origem: 'EXTERNA', registrante_id: null, dados_solicitante: 'Solicitação externa' });
    expect(JSON.stringify(item)).not.toMatch(/Sentinela|52998224725|example\.com/);
  });

  it('um S1 por destinatário elegível, sem S2 e sem avisar quem não deve', async () => {
    const resposta = await enviar(corpo(), tentativa());
    expect(resposta.status).toBe(201);
    const s = await solicitacaoPorProtocolo(resposta.body.protocolo);
    criadas.push(s.id);

    const esperados = await audienciaEsperada();
    expect(esperados).toEqual(expect.arrayContaining([administrador.id, gestorSvo.id]));
    expect(esperados).not.toContain(administradorInativo.id);
    expect(esperados).not.toContain(solicitante.id);

    const avisos = await avisosS1(s.id);
    expect(avisos.map((a) => a.usuario_id)).toEqual(esperados);
    const todos = await db('notificacoes').where({ referencia_tipo: 'SOLICITACAO_SVO', referencia_id: s.id });
    expect(todos).toHaveLength(esperados.length);
    // Texto neutro: sem endereço, CPF ou dados clínicos
    expect(JSON.stringify(todos)).not.toMatch(/Rua Ficticia|52998224725|Sentinela|Falecido/);
    const outbox = await db('notificacao_outbox').where({ referencia_tipo: 'SOLICITACAO_SVO', referencia_id: s.id });
    expect(outbox.map((o) => o.usuario_id).sort()).toEqual([...esperados].sort());
  });

  it('repetição da mesma intenção devolve o mesmo resultado, sem novo chamado nem novo S1', async () => {
    const t = tentativa();
    const primeira = await enviar(corpo(), t);
    expect(primeira.status).toBe(201);
    const s = await solicitacaoPorProtocolo(primeira.body.protocolo);
    criadas.push(s.id);
    const antes = await contarExternas();
    const avisosAntes = (await avisosS1(s.id)).length;

    const segunda = await enviar(corpo(), t);
    expect(segunda.status).toBe(200);
    expect(segunda.body).toEqual(primeira.body);
    expect(await contarExternas()).toBe(antes);
    expect((await avisosS1(s.id)).length).toBe(avisosAntes);
  });

  it('concorrência com a mesma chave gera um chamado e um S1 por destinatário', async () => {
    const t = tentativa();
    const antes = await contarExternas();
    const iniciais = await Promise.all(Array.from({ length: 6 }, () => enviar(corpo(), t)));
    const respostas = [];
    for (const resposta of iniciais) {
      if (resposta.status === 429) {
        expect(resposta.headers['retry-after']).toBe('1');
        respostas.push(await enviar(corpo(), t));
      } else {
        respostas.push(resposta);
      }
    }

    expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(respostas.filter((r) => r.status === 200)).toHaveLength(5);
    const protocolos = new Set(respostas.map((r) => r.body.protocolo));
    const credenciais = new Set(respostas.map((r) => r.body.credencial));
    expect(protocolos.size).toBe(1);
    expect(credenciais.size).toBe(1);
    expect(await contarExternas()).toBe(antes + 1);

    const s = await solicitacaoPorProtocolo([...protocolos][0]!);
    criadas.push(s.id);
    const esperados = await audienciaEsperada();
    expect((await avisosS1(s.id)).map((a) => a.usuario_id)).toEqual(esperados);
  });

  it('mesma chave: prova errada recebe 401 uniforme; conteúdo diferente só para quem prova a posse (409)', async () => {
    const t = tentativa();
    const primeira = await enviar(corpo(), t);
    expect(primeira.status).toBe(201);
    criadas.push((await solicitacaoPorProtocolo(primeira.body.protocolo)).id);
    const antes = await contarExternas();
    const auditoriasAntes = await contarAuditoriasExternas();

    const provaErrada = { ...t, prova: 'Z'.repeat(43) };
    const mesmoConteudo = await enviar(corpo(), provaErrada);
    const outroConteudo = await enviar(corpo({ descricao_ocorrencia: 'Outra descricao sintetica.' }), provaErrada);
    const chaveInexistente = await enviar(corpo({ descricao_ocorrencia: 'Outra descricao sintetica.' }), { ...t, chave: `inexistente-${nonce()}${nonce()}` });
    for (const resposta of [mesmoConteudo, outroConteudo]) {
      expect(resposta.status).toBe(401);
      expect(resposta.body.codigo).toBe('CREDENCIAL_EXTERNA_INVALIDA');
      expect(JSON.stringify(resposta.body)).not.toContain(primeira.body.credencial);
    }
    // Quem erra a prova não distingue "payload diferente" de "prova errada"
    expect(outroConteudo.body).toEqual(mesmoConteudo.body);
    criadas.push(...(await db('solicitacoes_svo').where({ protocolo: chaveInexistente.body.protocolo }).pluck('id')));

    const conflito = await enviar(corpo({ descricao_ocorrencia: 'Outra descricao sintetica.' }), t);
    expect(conflito.status).toBe(409);
    expect(conflito.body.codigo).toBe('CONFLITO_IDEMPOTENCIA');
    expect(JSON.stringify(conflito.body)).not.toContain(primeira.body.credencial);

    // Só a chave inexistente criou chamado; nenhuma das outras tentativas gravou
    expect(await contarExternas()).toBe(antes + 1);
    expect(await contarAuditoriasExternas()).toBe(auditoriasAntes + 1);
  });

  it('rollback: falha ao publicar o S1 não deixa chamado, credencial, aviso ou auditoria órfãos', async () => {
    const t = tentativa();
    const antes = await contarExternas();
    const auditoriasAntes = await contarAuditoriasExternas();
    const avisosAntes = Number((await db('notificacoes').where({ tipo: EVENTO_SVO_S1 }).count({ total: '*' }).first())?.total ?? 0);
    vi.spyOn(notificacaoSvoService, 'publicarAlertasRegistroSolicitacao').mockRejectedValueOnce(new Error('falha simulada'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const falha = await enviar(corpo(), t);
    expect(falha.status).toBe(500);
    expect(falha.body).toEqual({ erro: 'Erro interno do servidor' });

    expect(await contarExternas()).toBe(antes);
    expect(await contarAuditoriasExternas()).toBe(auditoriasAntes);
    expect(await db('solicitacoes_svo_credenciais_externas').where({ chave_idempotencia_criacao: t.chave })).toHaveLength(0);
    const avisosDepois = Number((await db('notificacoes').where({ tipo: EVENTO_SVO_S1 }).count({ total: '*' }).first())?.total ?? 0);
    expect(avisosDepois).toBe(avisosAntes);

    // A chave não ficou "queimada": a mesma tentativa funciona depois
    const novamente = await enviar(corpo(), t);
    expect(novamente.status).toBe(201);
    criadas.push((await solicitacaoPorProtocolo(novamente.body.protocolo)).id);
  });

  it('perda da primeira resposta após o commit: a repetição recupera protocolo e credencial válidos', async () => {
    const t = tentativa();
    const perdida = await enviar(corpo(), t); // o cidadão nunca viu esta resposta
    expect(perdida.status).toBe(201);
    const s = await solicitacaoPorProtocolo(perdida.body.protocolo);
    criadas.push(s.id);

    const recuperada = await enviar(corpo(), t);
    expect(recuperada.status).toBe(200);
    expect(recuperada.body.protocolo).toBe(perdida.body.protocolo);
    expect(recuperada.body.credencial).toBe(perdida.body.credencial);

    const credencial = await db('solicitacoes_svo_credenciais_externas').where({ solicitacao_id: s.id }).first();
    expect(credencial.segredo_digest).toBe(
      calcularDigestCredencialExterna(recuperada.body.credencial, credencial.algoritmo_digest, credencial.versao_credencial),
    );
    expect(await db('solicitacoes_svo').where({ protocolo: perdida.body.protocolo })).toHaveLength(1);
    expect((await avisosS1(s.id)).length).toBe((await audienciaEsperada()).length);
  });

  describe('integração real com a SCRUM-266 (serviço, API de acompanhamento e recuperação)', () => {
    const consultar = (protocolo: string, credencial: string) =>
      request(app).post(`${URL_EXTERNA}/acompanhamento`).send({ protocolo, credencial });

    it('cria, perde a resposta, repete, recupera o mesmo comprovante e consulta pelo acompanhamento real', async () => {
      const t = tentativa();
      const perdida = await enviar(corpo(), t); // 1-2: criou e commitou; o cidadão não recebeu a resposta
      expect(perdida.status).toBe(201);
      const s = await solicitacaoPorProtocolo(perdida.body.protocolo);
      criadas.push(s.id);

      const repetida = await enviar(corpo(), t); // 3-5: repetição dentro da janela recupera o mesmo comprovante
      expect(repetida.status).toBe(200);
      expect(repetida.body.protocolo).toBe(perdida.body.protocolo);
      expect(repetida.body.credencial).toBe(perdida.body.credencial);

      // 6: a API de acompanhamento da SCRUM-266 aceita a credencial emitida pelo endpoint público
      const consulta = await consultar(repetida.body.protocolo, repetida.body.credencial);
      expect(consulta.status).toBe(200);
      expect(consulta.headers['cache-control']).toContain('no-store');
      expect(consulta.body).toMatchObject({ protocolo: repetida.body.protocolo, status: 'RECEBIDA', status_label: 'Recebida' });
      expect(JSON.stringify(consulta.body)).not.toMatch(/Sentinela|52998224725|example\.com/);
      expect((await consultar(repetida.body.protocolo, 'x'.repeat(43))).status).toBe(401);

      // 7: um único chamado e um S1 lógico por destinatário
      expect(await db('solicitacoes_svo').where({ protocolo: perdida.body.protocolo })).toHaveLength(1);
      expect(await db('solicitacoes_svo_credenciais_externas').where({ solicitacao_id: s.id })).toHaveLength(1);
      expect((await avisosS1(s.id)).map((a) => a.usuario_id)).toEqual(await audienciaEsperada());
    });

    it('percorre os sete estados públicos com as transições operacionais reais', async () => {
      const criar = async () => {
        const resposta = await enviar(corpo(), tentativa()).expect(201);
        const { id } = await solicitacaoPorProtocolo(resposta.body.protocolo);
        criadas.push(id);
        return {
          id,
          estado: async (status: string) => {
            const respostaPublica = await consultar(resposta.body.protocolo, resposta.body.credencial).expect(200);
            expect(respostaPublica.body.status).toBe(status);
            return respostaPublica.body;
          },
        };
      };
      const emAtendimento = await criar();
      await emAtendimento.estado('RECEBIDA');
      const fluxo = (id: number, acao: string) => request(app)
        .patch('/api/solicitacoes-svo/' + id + '/' + acao).set('Authorization', gestorSvo.token);
      const confirmar = async (id: number) => {
        await fluxo(id, 'confirmar').expect(201);
        return db('ordens_svo').where({ solicitacao_id: id }).first('id');
      };
      await fluxo(emAtendimento.id, 'iniciar-analise').expect(200);
      await emAtendimento.estado('EM_ANALISE');
      const ordem = await confirmar(emAtendimento.id);
      await emAtendimento.estado('CONFIRMADA');

      const condutor = await conta(admin, 'MOTORISTA_SVO');
      const integrante = await conta(admin, 'INTEGRANTE_SVO');
      const chave = nonce();
      const [veiculo] = await admin('veiculos').insert({
        placa: 'T' + chave, modelo: 'Veículo sintético', tipo_frota: 'SVO',
        capacidade_maxima: 4, lotacao_cabine: 3, status: 'DISPONIVEL',
      }).returning('id');
      const [motorista] = await admin('motoristas').insert({
        usuario_id: condutor.id, numero_cnh: chave, categoria_cnh: 'B',
        validade_cnh: '2099-12-31', tipo_motorista: 'SVO', status: 'DISPONIVEL',
      }).returning('id');
      const [equipe] = await admin('equipes_svo').insert({ nome_equipe: 'Equipe sintética ' + chave }).returning('id');
      await admin('equipes_svo_integrantes').insert({
        equipe_id: equipe.id, usuario_id: integrante.id, vinculado_em: new Date(),
      });
      await request(app).post('/api/viagens').set('Authorization', gestorSvo.token).send({
        tipo_operacao: 'SVO', solicitacao_id: emAtendimento.id, veiculo_id: veiculo.id,
        motorista_id: motorista.id, equipe_id: equipe.id, integrantes_ids: [integrante.id],
        inicio_previsto: new Date(Date.now() + 60_000).toISOString(),
        fim_previsto: new Date(Date.now() + 3_600_000).toISOString(),
      }).expect(200);
      expect((await db('solicitacoes_svo').where({ id: emAtendimento.id }).first()).status).toBe('EM_ANDAMENTO');
      await emAtendimento.estado('CONFIRMADA');

      // Avança somente a janela da fixture para exercitar a liberação e saída reais sem esperar um minuto.
      await admin('ordens_svo').where({ id: ordem.id }).update({ inicio_previsto: new Date(Date.now() - 60_000) });
      const motoristaNaOrdem = (caminho: string) => request(app).patch('/api/viagens/' + caminho)
        .set('Authorization', condutor.token);
      await motoristaNaOrdem(ordem.id + '/iniciar').send({ tipo_operacao: 'SVO', km_inicial: 10 }).expect(200);
      await emAtendimento.estado('EM_ANDAMENTO');
      await motoristaNaOrdem('ordens-svo/' + ordem.id + '/chegar-local').expect(200);
      await emAtendimento.estado('EM_ANDAMENTO');
      await motoristaNaOrdem(ordem.id + '/finalizar').send({ tipo_operacao: 'SVO', km_final: 20 }).expect(200);
      const encerrada = await emAtendimento.estado('CONCLUIDA');
      expect(Date.parse(encerrada.consulta_disponivel_ate) - Date.parse(encerrada.encerrada_em)).toBe(30 * 86_400_000);

      const recusada = await criar();
      await fluxo(recusada.id, 'recusar').send({ motivo_recusa: 'Justificativa interna sintética' }).expect(200);
      const naoAcolhida = await recusada.estado('NAO_ACOLHIDA');
      expect(JSON.stringify(naoAcolhida)).not.toContain('Justificativa interna sintética');
      const cancelada = await criar();
      const ordemCancelada = await confirmar(cancelada.id);
      await request(app).patch('/api/viagens/' + ordemCancelada.id + '/cancelar')
        .set('Authorization', gestorSvo.token).send({ tipo_operacao: 'SVO', cancelar_solicitacao: true }).expect(200);
      await cancelada.estado('CANCELADA');
    });

    it('o endpoint de recuperação da SCRUM-266 devolve o mesmo comprovante (payload original)', async () => {
      const t = tentativa();
      const criada = await enviar(corpo(), t);
      expect(criada.status).toBe(201);
      criadas.push((await solicitacaoPorProtocolo(criada.body.protocolo)).id);

      const recuperada = await request(app)
        .post(`${URL_EXTERNA}/recuperar-comprovante`)
        .set({ 'Idempotency-Key': t.chave, 'X-Prova-Tentativa': t.prova })
        .send({ payload: corpo() });
      expect(recuperada.status).toBe(200);
      expect(recuperada.body.protocolo).toBe(criada.body.protocolo);
      expect(recuperada.body.credencial).toBe(criada.body.credencial);
    });

    it('janela de recuperação expirada: não devolve a credencial nem cria novo chamado', async () => {
      const t = tentativa();
      const criada = await enviar(corpo(), t);
      expect(criada.status).toBe(201);
      criadas.push((await solicitacaoPorProtocolo(criada.body.protocolo)).id);
      const antes = await contarExternas();

      const dados = solicitacaoSvoExternaSchema.parse(corpo());
      const depoisDaJanela = new Date(Date.now() + 16 * 60 * 1000);
      await expect(
        solicitacaoSvoExternaService.registrar(dados, { chaveIdempotencia: t.chave, provaTentativa: t.prova }, { agora: depoisDaJanela }),
      ).rejects.toMatchObject({ statusCode: 401, codigo: 'CREDENCIAL_EXTERNA_INVALIDA' });
      expect(await contarExternas()).toBe(antes);
    });

    it('bloqueia consulta e recuperação em conexões separadas até a revogação concluir', async () => {
      const t = tentativa();
      const criada = await enviar(corpo(), t);
      expect(criada.status).toBe(201);
      const s = await solicitacaoPorProtocolo(criada.body.protocolo);
      criadas.push(s.id);
      const revogacao = await db.transaction();
      const consulta = await db.transaction();
      const recuperacao = await db.transaction();
      try {
        const { rows: [{ pid: pidConsulta }] } = await consulta.raw('SELECT pg_backend_pid() AS pid');
        const { rows: [{ pid: pidRecuperacao }] } = await recuperacao.raw('SELECT pg_backend_pid() AS pid');
        expect(pidConsulta).not.toBe(pidRecuperacao);
        await acompanhamentoExternoSvoModel.revogarCredencial(s.id, 'revogação sintética', new Date(), revogacao);
        const acessos = Promise.allSettled([
          acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
            criada.body.protocolo, criada.body.credencial, { conexao: consulta },
          ).finally(() => consulta.rollback()),
          acompanhamentoExternoSvoService.recuperarComprovanteTentativa({
            chaveIdempotencia: t.chave,
            provaTentativa: t.prova,
            payloadNormalizado: solicitacaoSvoExternaSchema.parse(corpo()),
          }, recuperacao).finally(() => recuperacao.rollback()),
        ]);
        await vi.waitFor(async () => {
          const { rows: [bloqueios] } = await admin.raw(
            'SELECT cardinality(pg_blocking_pids(?)) AS consulta, cardinality(pg_blocking_pids(?)) AS recuperacao',
            [pidConsulta, pidRecuperacao],
          );
          expect(bloqueios.consulta).toBeGreaterThan(0);
          expect(bloqueios.recuperacao).toBeGreaterThan(0);
        });
        await revogacao.commit();
        expect(await acessos).toEqual([
          { status: 'rejected', reason: expect.objectContaining({ statusCode: 401 }) },
          { status: 'rejected', reason: expect.objectContaining({ statusCode: 401 }) },
        ]);
        const envelope = await admin('solicitacoes_svo_recuperacoes_tentativa').where({ solicitacao_id: s.id }).first();
        expect(envelope).toMatchObject({ envelope_cifrado: null, descartada_em: expect.any(Date) });
      } finally {
        await Promise.all([revogacao, consulta, recuperacao].map(async (trx) => {
          if (!trx.isCompleted()) await trx.rollback();
        }));
      }
    });

    it('credencial revogada: a repetição responde 401 uniforme e não cria novo chamado', async () => {
      const t = tentativa();
      const criada = await enviar(corpo(), t);
      expect(criada.status).toBe(201);
      const s = await solicitacaoPorProtocolo(criada.body.protocolo);
      criadas.push(s.id);
      await admin('solicitacoes_svo_credenciais_externas')
        .where({ solicitacao_id: s.id })
        .update({ revogada_em: admin.fn.now(), revogada_motivo: 'teste de revogacao', atualizado_em: admin.fn.now() });
      const antes = await contarExternas();

      const repetida = await enviar(corpo(), t);
      expect(repetida.status).toBe(401);
      expect(repetida.body.codigo).toBe('CREDENCIAL_EXTERNA_INVALIDA');
      expect((await consultar(criada.body.protocolo, criada.body.credencial)).status).toBe(401);
      expect(await contarExternas()).toBe(antes);
    });

    it('rotação de chaves: a tentativa antiga continua recuperável com a versão com que foi emitida', async () => {
      const t = tentativa();
      const original = env.credencialExternaSvo;
      const criada = await enviar(corpo(), t);
      expect(criada.status).toBe(201);
      criadas.push((await solicitacaoPorProtocolo(criada.body.protocolo)).id);

      const mutavel = env as unknown as { credencialExternaSvo: typeof original };
      mutavel.credencialExternaSvo = {
        ...original,
        versaoAtual: original.versaoAtual + 1,
        segredoAtual: `rotacao-${nonce()}${nonce()}`.padEnd(48, 'r'),
        segredosAnteriores: { ...original.segredosAnteriores, [original.versaoAtual]: original.segredoAtual },
      };
      try {
        const recuperada = await enviar(corpo(), t);
        expect(recuperada.status).toBe(200);
        expect(recuperada.body.credencial).toBe(criada.body.credencial);
        expect((await consultar(criada.body.protocolo, criada.body.credencial)).status).toBe(200);

        // Tentativa nova já nasce com a versão nova
        const nova = await enviar(corpo(), tentativa());
        expect(nova.status).toBe(201);
        const linha = await solicitacaoPorProtocolo(nova.body.protocolo);
        criadas.push(linha.id);
        const credencial = await db('solicitacoes_svo_credenciais_externas').where({ solicitacao_id: linha.id }).first();
        expect(credencial.versao_credencial).toBe(original.versaoAtual + 1);
      } finally {
        mutavel.credencialExternaSvo = original;
      }
    });

    it('falha transacional da SCRUM-266 desfaz o chamado inteiro', async () => {
      const t = tentativa();
      const antes = await contarExternas();
      vi.spyOn(acompanhamentoExternoSvoService, 'emitirCredencialNaTransacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect((await enviar(corpo(), t)).status).toBe(500);
      expect(await contarExternas()).toBe(antes);
      expect(await db('solicitacoes_svo_credenciais_externas').where({ chave_idempotencia_criacao: t.chave })).toHaveLength(0);
    });
  });

  it('flag desligada bloqueia sem gravar nada', async () => {
    env.recursosOperacionais = carregarRecursosOperacionais({});
    const antes = await contarExternas();
    const resposta = await enviar(corpo(), tentativa());
    expect(resposta.status).toBe(404);
    expect(await contarExternas()).toBe(antes);
  });

  it('campos inválidos e corpo acima do teto não gravam nada', async () => {
    const antes = await contarExternas();
    expect((await enviar(corpo({ cpf_solicitante: '529.982.247-26' }), tentativa())).status).toBe(400);
    expect((await enviar(corpo({ status: 'CONFIRMADA' }), tentativa())).status).toBe(400);
    expect((await enviar(corpo({ descricao_ocorrencia: 'a'.repeat(150_000) }), tentativa())).status).toBe(413);
    expect(await contarExternas()).toBe(antes);
  });

  it('o registro interno continua válido: registrante do usuário, canal INTERNA e sem protocolo', async () => {
    const resposta = await request(app).post('/api/solicitacoes-svo').set('Authorization', gestorSvo.token)
      .send({ dados_solicitante: 'Familiar Sintetico', local_ocorrencia: 'Rua Interna Sintetica' });
    expect(resposta.status).toBe(201);
    criadas.push(resposta.body.id);
    const s = await db('solicitacoes_svo').where({ id: resposta.body.id }).first();
    expect(s).toMatchObject({ registrante_id: gestorSvo.id, canal_origem: 'INTERNA', protocolo: null, status: 'EM_TRIAGEM' });
  });
});
