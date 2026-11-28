import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [backend, dist, evidencias] = process.argv.slice(2).map((pasta) => resolve(pasta));
const { POSTGRES_HOST, POSTGRES_DB, POSTGRES_APP_USER, DB_ROLE, NODE_ENV } = process.env;
if (!backend || !dist || !evidencias || POSTGRES_HOST !== '127.0.0.1' || POSTGRES_DB !== 'frotas_teste' ||
    !POSTGRES_APP_USER || DB_ROLE !== 'app' || NODE_ENV !== 'test' || process.env.SVO_BROWSER_DESCARTAVEL !== '1') {
  throw new Error('Informe backend compilado, dist e pasta de evidências. Use PostgreSQL descartável local, role app e SVO_BROWSER_DESCARTAVEL=1.');
}

const carregar = createRequire(join(backend, 'package.json'));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { app } = carregar('./dist/app.js');
const { db } = carregar('./dist/config/database.js');
const { env } = carregar('./dist/config/env.js');
const { acompanhamentoExternoSvoService } = carregar('./dist/services/acompanhamentoExternoSvoService.js');
const { carregarRecursosOperacionais } = carregar('./dist/config/recursosOperacionais.js');
const flags = { PORTAL_SVO_ATIVO: 'true', ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true' };
env.recursosOperacionais = carregarRecursosOperacionais(flags);
const consultarPublico = acompanhamentoExternoSvoService.consultarAcompanhamentoPublico;
let relogioConsulta;
acompanhamentoExternoSvoService.consultarAcompanhamentoPublico = function (protocolo, credencial, opcoes) {
  return consultarPublico.call(this, protocolo, credencial, relogioConsulta ? { ...opcoes, agora: relogioConsulta } : opcoes);
};
const knex = carregar('knex');
const admin = knex({
  client: 'pg',
  connection: {
    host: POSTGRES_HOST, database: POSTGRES_DB, port: Number(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_MIGRATION_USER || process.env.POSTGRES_USER,
    password: process.env.POSTGRES_MIGRATION_PASSWORD || process.env.POSTGRES_PASSWORD,
  },
});

const consulta = '/api/solicitacoes-svo/externas/acompanhamento';
const cadastro = '/api/solicitacoes-svo/externas';
const observadas = [];
const registros = [];
const consultarDepoisDe = new Map();
const pendentes = new Set();
const tipos = new Map(Object.entries({
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
}));
const servidor = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://127.0.0.1');
  if (pathname.startsWith('/api/')) {
    const item = { caminho: pathname, metodo: req.method, authorization: !!req.headers.authorization, cookie: !!req.headers.cookie };
    observadas.push(item);
    res.on('finish', () => { item.status = res.statusCode; });
    const espera = consultarDepoisDe.get(pathname);
    consultarDepoisDe.delete(pathname);
    if (espera) await espera;
    return app(req, res);
  }
  const arquivo = tipos.has(extname(pathname)) ? resolve(dist, '.' + pathname) : join(dist, 'index.html');
  if (!arquivo.startsWith(dist + sep)) return res.writeHead(404).end();
  try {
    res.writeHead(200, { 'Content-Type': tipos.get(extname(arquivo)) });
    res.end(await readFile(arquivo));
  } catch { res.destroy(); }
});

function pausarConsulta() {
  const bloqueio = Promise.withResolvers();
  consultarDepoisDe.set(consulta, bloqueio.promise);
  pendentes.add(bloqueio.resolve);
  return () => {
    pendentes.delete(bloqueio.resolve);
    bloqueio.resolve();
  };
}

const nonce = () => randomBytes(4).toString('hex');
const senha = randomBytes(24).toString('hex');
let origem;
async function api(caminho, { metodo = 'POST', corpo, token, headers } = {}, status = 200) {
  const resposta = await fetch(origem + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Origin: origem, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  assert.equal(resposta.status, status, `${metodo} ${caminho}`);
  return resposta.status === 204 ? null : resposta.json();
}

async function conta(perfil) {
  const email = `${nonce()}@testes.invalid`;
  const [usuario] = await admin('usuarios').insert({
    nome: `Conta sintética ${perfil}`, email, senha: await carregar('bcryptjs').hash(senha, 4), perfil, ativo: true,
    tipo_usuario: perfil === 'MOTORISTA_SVO' ? 'MOTORISTA' : perfil,
  }).returning('id');
  if (perfil === 'GESTOR_SVO') {
    const unidade = await admin('unidades').where({ nome: 'SVO' }).first('id');
    await admin('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: usuario.id });
  }
  const { token } = await api('/api/auth/login', { corpo: { email, senha } });
  return { ...usuario, token, email };
}

const nomePrivado = 'Nome sintético reservado à triagem';
const justificativaInterna = 'Justificativa interna sintética';
async function criar() {
  const corpo = {
    tipo_solicitante: 'PESSOA_FISICA', nome_solicitante: nomePrivado, telefone_solicitante: '(79) 99999-0000',
    email_solicitante: 'qa@example.invalid', cpf_solicitante: '529.982.247-25', nome_falecido: 'Pessoa sintética',
    local_ocorrencia: 'Rua de teste', numero_imovel: '10', descricao_ocorrencia: 'Ocorrência sintética.',
    data_hora_ocorrencia: new Date(Date.now() - 60_000).toISOString(), ciencia_aviso_privacidade: true,
    versao_aviso_privacidade: '2026-11-v1',
  };
  const headers = { 'Idempotency-Key': `tentativa-${nonce()}${nonce()}`, 'X-Prova-Tentativa': randomBytes(32).toString('hex') };
  const comprovante = await api(cadastro, { corpo, headers }, 201);
  const solicitacao = await admin('solicitacoes_svo').where({ protocolo: comprovante.protocolo }).first('id');
  assert.ok(solicitacao);
  return { ...comprovante, ...solicitacao };
}

let browser;
try {
  await mkdir(evidencias, { recursive: true });
  const papel = await db.raw('SELECT current_user');
  assert.equal(papel.rows[0].current_user, POSTGRES_APP_USER);
  await new Promise((ok, falha) => servidor.once('error', falha).listen(0, '127.0.0.1', ok));
  origem = `http://127.0.0.1:${servidor.address().port}`;
  env.corsOrigens.push(origem);
  const gestor = await conta('GESTOR_SVO');
  const condutor = await conta('MOTORISTA_SVO');
  const integrante = await conta('INTEGRANTE_SVO');
  const atendimento = await criar();
  const recusada = await criar();
  const cancelada = await criar();
  const fluxo = (id, acao, corpo, status = 200) => api(`/api/solicitacoes-svo/${id}/${acao}`, {
    metodo: 'PATCH', token: gestor.token, corpo,
  }, status);
  const confirmar = async (id) => {
    await fluxo(id, 'confirmar', undefined, 201);
    return admin('ordens_svo').where({ solicitacao_id: id }).first('id');
  };

  browser = await chromium.launch({ channel: process.env.SVO_CHROMIUM_CHANNEL || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const pagina = await context.newPage();
  await pagina.goto(origem + '/acompanhar');
  const titulo = pagina.getByRole('heading', { name: 'Acompanhar solicitação' });
  await titulo.waitFor();
  const protocolo = pagina.getByLabel('Protocolo', { exact: true });
  const segredo = pagina.getByLabel('Segredo', { exact: true });
  const botao = pagina.getByRole('button', { name: 'Consultar', exact: true });
  const respostaConsulta = () => pagina.waitForResponse((resposta) => new URL(resposta.url()).pathname === consulta);
  async function preencher(dados, credencial = dados.credencial) {
    await protocolo.fill(dados.protocolo);
    await segredo.fill(credencial);
  }
  async function consultar(dados, status, credencial) {
    await preencher(dados, credencial);
    const retorno = respostaConsulta();
    await segredo.press('Enter');
    const resposta = await retorno;
    assert.equal(resposta.status(), status);
    assert.match(resposta.headers()['cache-control'], /no-store/);
    return resposta.json();
  }
  async function validarEstado(dados, estado, rotulo, atualizar = false) {
    let dto;
    if (atualizar) {
      const retorno = respostaConsulta();
      await pagina.getByRole('button', { name: 'Atualizar', exact: true }).press('Enter');
      const resposta = await retorno;
      assert.equal(resposta.status(), 200);
      dto = await resposta.json();
    } else {
      dto = await consultar(dados, 200);
    }
    assert.equal(dto.status, estado);
    await pagina.getByText(rotulo, { exact: true }).waitFor();
    await pagina.getByText(dto.mensagem_publica, { exact: true }).waitFor();
    const publico = await pagina.locator('main').innerText();
    for (const reservado of [nomePrivado, justificativaInterna, dados.credencial, 'Veículo sintético']) {
      assert.ok(!publico.includes(reservado) && !JSON.stringify(dto).includes(reservado));
    }
    assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    registros.push(estado);
    return dto;
  }

  await botao.press('Enter');
  await pagina.getByText('Informe o protocolo e o segredo para consultar.').waitFor();
  assert.ok(await protocolo.evaluate((campo) => campo === document.activeElement && campo.getAttribute('aria-invalid') === 'true'));
  assert.ok(await protocolo.getAttribute('aria-describedby'));
  await pagina.keyboard.press('Tab');
  assert.ok(await segredo.evaluate((campo) => campo === document.activeElement));
  await validarEstado(atendimento, 'RECEBIDA', 'Recebida');
  await fluxo(atendimento.id, 'iniciar-analise');
  await validarEstado(atendimento, 'EM_ANALISE', 'Em análise', true);
  const ordem = await confirmar(atendimento.id);
  await validarEstado(atendimento, 'CONFIRMADA', 'Confirmada', true);

  const chave = nonce();
  const [veiculo] = await admin('veiculos').insert({
    placa: 'T' + chave, modelo: 'Veículo sintético', tipo_frota: 'SVO', capacidade_maxima: 4, lotacao_cabine: 3, status: 'DISPONIVEL',
  }).returning('id');
  const [motorista] = await admin('motoristas').insert({
    usuario_id: condutor.id, numero_cnh: chave, categoria_cnh: 'B', validade_cnh: '2099-12-31', tipo_motorista: 'SVO', status: 'DISPONIVEL',
  }).returning('id');
  const [equipe] = await admin('equipes_svo').insert({ nome_equipe: `Equipe sintética ${chave}` }).returning('id');
  await admin('equipes_svo_integrantes').insert({ equipe_id: equipe.id, usuario_id: integrante.id, vinculado_em: new Date() });
  await api('/api/viagens', { token: gestor.token, corpo: {
    tipo_operacao: 'SVO', solicitacao_id: atendimento.id, veiculo_id: veiculo.id, motorista_id: motorista.id,
    equipe_id: equipe.id, integrantes_ids: [integrante.id], inicio_previsto: new Date(Date.now() + 60_000).toISOString(),
    fim_previsto: new Date(Date.now() + 3_600_000).toISOString(),
  } });
  await validarEstado(atendimento, 'CONFIRMADA', 'Confirmada', true);
  await admin('ordens_svo').where({ id: ordem.id }).update({ inicio_previsto: new Date(Date.now() - 60_000) });
  const executar = (acao, corpo) => api(`/api/viagens/${acao}`, { metodo: 'PATCH', token: condutor.token, corpo });
  await executar(`${ordem.id}/iniciar`, { tipo_operacao: 'SVO', km_inicial: 10 });
  await validarEstado(atendimento, 'EM_ANDAMENTO', 'Em andamento', true);
  await executar(`ordens-svo/${ordem.id}/chegar-local`);
  await executar(`${ordem.id}/finalizar`, { tipo_operacao: 'SVO', km_final: 20 });
  const encerrada = await validarEstado(atendimento, 'CONCLUIDA', 'Concluída', true);
  assert.equal(Date.parse(encerrada.consulta_disponivel_ate) - Date.parse(encerrada.encerrada_em), 30 * 86_400_000);
  await pagina.getByText(/Consulta disponível até/).waitFor();

  await fluxo(recusada.id, 'recusar', { motivo_recusa: justificativaInterna });
  await validarEstado(recusada, 'NAO_ACOLHIDA', 'Não acolhida');
  const ordemCancelada = await confirmar(cancelada.id);
  await api(`/api/viagens/${ordemCancelada.id}/cancelar`, {
    metodo: 'PATCH', token: gestor.token, corpo: { tipo_operacao: 'SVO', cancelar_solicitacao: true },
  });
  await validarEstado(cancelada, 'CANCELADA', 'Cancelada');
  await pagina.screenshot({ path: join(evidencias, 'acompanhamento-320.png'), fullPage: true, mask: [protocolo, segredo] });

  const errada = randomBytes(32).toString('base64url');
  const uniforme = await consultar(atendimento, 401, errada);
  assert.deepEqual(await consultar(atendimento, 401, cancelada.credencial), uniforme);
  assert.deepEqual(await consultar({ protocolo: 'SVO-20261128-ABCDEFGHJKLM' }, 401, errada), uniforme);
  assert.deepEqual(await api(consulta, { corpo: { protocolo: atendimento.protocolo } }, 401), uniforme);
  const credenciais = () => admin('solicitacoes_svo_credenciais_externas');
  await credenciais().where({ solicitacao_id: cancelada.id }).update({
    revogada_em: admin.fn.now(), revogada_motivo: 'Revogação sintética', atualizado_em: admin.fn.now(),
  });
  assert.deepEqual(await consultar(cancelada, 401), uniforme);
  const limite = Date.parse(encerrada.consulta_disponivel_ate);
  relogioConsulta = new Date(limite - 1);
  assert.equal((await consultar(atendimento, 200)).status, 'CONCLUIDA');
  relogioConsulta = new Date(limite);
  assert.deepEqual(await consultar(atendimento, 401), uniforme);
  relogioConsulta = undefined;
  registros.push('401 uniforme: protocolo isolado, inexistente, credencial incorreta, cruzada, revogada e expirada');
  registros.push('consulta válida 1 ms antes da expiração e negada no limite de 30 dias, com relógio injetado no serviço real');

  const editar = pausarConsulta();
  await preencher(recusada);
  const qtd = observadas.length;
  await segredo.press('Enter');
  await pagina.getByRole('status').filter({ hasText: 'Consultando solicitação…' }).waitFor({ state: 'attached' });
  await segredo.press('Enter');
  await delay(150);
  assert.equal(observadas.length, qtd + 1);
  await preencher(cancelada);
  await consultar(cancelada, 401);
  editar();
  await pagina.getByText(/Confira o protocolo e o segredo/).waitFor();
  assert.equal(await pagina.getByText('Não acolhida', { exact: true }).count(), 0);
  registros.push('carregamento, duplo envio e troca de dados com consulta pendente');

  const liberar = pausarConsulta();
  await pagina.clock.install();
  await preencher(recusada);
  await segredo.press('Enter');
  await pagina.clock.fastForward(20_001);
  await pagina.getByText('A consulta demorou demais. Tente novamente.').waitFor();
  liberar();
  await context.setOffline(true);
  await pagina.getByText(/Você está sem conexão/).waitFor();
  assert.ok(await botao.isDisabled());
  await context.setOffline(false);
  await consultar(recusada, 200);
  registros.push('timeout, offline e reconexão');

  await pagina.evaluate(async (reservado) => {
    const verificar = (valor) => {
      if (valor.includes(reservado)) throw new Error('Credencial encontrada no navegador');
    };
    verificar(location.href + JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
    for (const nome of await caches.keys()) {
      const cache = await caches.open(nome);
      for (const pedido of await cache.keys()) {
        verificar(pedido.url);
        verificar(await (await cache.match(pedido)).text());
      }
    }
    for (const { name } of await indexedDB.databases()) {
      const banco = await new Promise((ok, erro) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => ok(req.result);
        req.onerror = () => erro(req.error);
      });
      const nomes = Array.from(banco.objectStoreNames);
      const dados = await Promise.all(nomes.map((store) => new Promise((ok, erro) => {
        const req = banco.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => ok(req.result);
        req.onerror = () => erro(req.error);
      })));
      verificar(JSON.stringify(dados));
      banco.close();
    }
  }, recusada.credencial);
  assert.equal(observadas.filter((item) => item.caminho === '/api/auth/refresh').length, 0);
  assert.ok(observadas.filter((item) => item.caminho === consulta).every((item) => !item.authorization && !item.cookie));
  registros.push('consulta anônima sem refresh, Authorization, cookies ou credencial persistida');

  env.recursosOperacionais = carregarRecursosOperacionais({ PORTAL_SVO_ATIVO: 'true' });
  await consultar(recusada, 404);
  await pagina.getByText('O acompanhamento público está desativado no momento.').waitFor();
  registros.push('flag backend desativada');
  env.recursosOperacionais = carregarRecursosOperacionais(flags);

  const entrarNoSistema = async (paginaInterna, usuario) => {
    await paginaInterna.goto(origem + '/login');
    await paginaInterna.getByLabel('E-mail').fill(usuario.email);
    await paginaInterna.getByLabel('Senha', { exact: true }).fill(senha);
    await paginaInterna.getByRole('button', { name: 'Entrar', exact: true }).press('Enter');
    await paginaInterna.waitForURL('**/inicio');
  };
  const interna = await context.newPage();
  await interna.setViewportSize({ width: 1100, height: 800 });
  await entrarNoSistema(interna, gestor);
  assert.ok((await context.cookies()).some((cookie) => cookie.httpOnly && cookie.name === 'refreshToken'));
  const antesDeAbrirAcompanhamento = observadas.length;
  await pagina.goto(origem + '/acompanhar');
  await consultar(recusada, 200);
  const chamadasComSessao = observadas.slice(antesDeAbrirAcompanhamento);
  assert.ok(chamadasComSessao.every((item) => item.caminho !== '/api/auth/refresh'));
  assert.ok(chamadasComSessao.some((item) => item.caminho === consulta && !item.authorization && !item.cookie));
  await pagina.evaluate(() => {
    history.pushState({}, '', '/inicio');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await pagina.waitForURL('**/inicio');
  const prazoSessao = Date.now() + 8000;
  while (!observadas.slice(antesDeAbrirAcompanhamento).some((item) => item.caminho === '/api/auth/refresh' && item.status === 200)) {
    assert.ok(Date.now() < prazoSessao, 'A sessão não foi restaurada na rota interna');
    await delay(40);
  }
  await pagina.getByRole('main').waitFor();
  assert.ok(observadas.slice(antesDeAbrirAcompanhamento).some((item) => item.authorization));
  await context.clearCookies({ name: 'refreshToken' });
  await pagina.reload();
  await pagina.waitForURL('**/login');
  registros.push('login real, abertura direta da rota pública sem enviar sessão, restauração na protegida e redirecionamento quando o cookie falta');

  await pagina.setViewportSize({ width: 1200, height: 850 });
  await entrarNoSistema(pagina, gestor);
  await interna.goto(origem + '/inicio');
  await interna.getByRole('main').waitFor();
  await context.setOffline(true);
  await pagina.getByRole('button', { name: 'Sair da conta' }).press('Enter');
  await Promise.all([pagina.waitForURL('**/login'), interna.waitForURL('**/login')]);
  const chaveLogout = 'fsph.auth.logout-pendente';
  assert.equal(await pagina.evaluate((chave) => localStorage.getItem(chave), chaveLogout), '1');
  const reconciliacao = pagina.waitForResponse((resposta) => resposta.url().endsWith('/api/auth/logout') && resposta.ok());
  await context.setOffline(false);
  await reconciliacao;
  await pagina.waitForFunction((chave) => localStorage.getItem(chave) === null, chaveLogout);
  assert.ok((await context.cookies()).every((cookie) => cookie.name !== 'refreshToken'));
  await entrarNoSistema(pagina, condutor);
  const novaConta = interna.waitForResponse((resposta) => resposta.url().endsWith('/api/auth/refresh') && resposta.ok());
  await interna.goto(origem + '/inicio');
  assert.equal((await (await novaConta).json()).usuario.id, condutor.id);
  await interna.getByRole('main').waitFor();
  registros.push('logout pendente offline, sincronização de abas, reconciliação após reconexão e troca de conta');

  const perfilZoom = await mkdtemp(join(tmpdir(), 'fsph-zoom-'));
  let contextoZoom;
  try {
    contextoZoom = await chromium.launchPersistentContext(perfilZoom, {
      channel: process.env.SVO_CHROMIUM_CHANNEL || 'chrome', viewport: null,
    });
    const ampliada = contextoZoom.pages()[0];
    await ampliada.goto(origem + '/acompanhar');
    const escalaInicial = await ampliada.evaluate(() => devicePixelRatio);
    const ajustes = await contextoZoom.newPage();
    await ajustes.goto('chrome://settings/appearance');
    const zoom = ajustes.locator('select').filter({ has: ajustes.locator('option').filter({ hasText: /^\s*200%\s*$/ }) });
    const opcao = zoom.locator('option').filter({ hasText: /^\s*200%\s*$/ });
    await zoom.selectOption(await opcao.getAttribute('value'));
    await ampliada.waitForFunction((escala) => devicePixelRatio === escala * 2, escalaInicial);
    await ampliada.getByLabel('Protocolo').fill(recusada.protocolo);
    await ampliada.getByLabel('Segredo', { exact: true }).fill(recusada.credencial);
    await ampliada.getByRole('button', { name: 'Consultar', exact: true }).press('Enter');
    await ampliada.getByText('Não acolhida', { exact: true }).waitFor();
    assert.ok(await ampliada.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ampliada.screenshot({ path: join(evidencias, 'acompanhamento-zoom-200.png'), fullPage: true,
      mask: [ampliada.getByLabel('Protocolo'), ampliada.getByLabel('Segredo', { exact: true })] });
    registros.push('zoom nativo de 200% do Chrome, consulta real por teclado e sem rolagem horizontal');
  } finally {
    await contextoZoom?.close();
    await rm(perfilZoom, { recursive: true, force: true, maxRetries: 3 });
  }

  let acimaDaCota = false;
  for (let i = 0; i < 16; i++) {
    const resposta = await fetch(origem + consulta, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolo: recusada.protocolo, credencial: errada }),
    });
    await resposta.text();
    if (resposta.status === 429) {
      acimaDaCota = true;
      break;
    }
    assert.equal(resposta.status, 401);
  }
  assert.ok(acimaDaCota);
  await pagina.goto(origem + '/acompanhar');
  await preencher(recusada);
  const retorno429 = respostaConsulta();
  await segredo.press('Enter');
  const resposta429 = await retorno429;
  assert.equal(resposta429.status(), 429);
  assert.ok(Number(resposta429.headers()['retry-after']) > 0);
  await pagina.getByRole('button', { name: /Aguarde \d+s/ }).waitFor();
  registros.push('429 real, Retry-After e espera anunciada na interface');

  await writeFile(join(evidencias, 'acompanhamento.json'), JSON.stringify({
    browser: browser.version(), larguraCss: 320, role: papel.rows[0].current_user,
    cenarios: registros, requisicoes: observadas.filter((item) => item.caminho === consulta),
  }, null, 2));
  console.log(registros.join('\n'));
} finally {
  for (const liberar of pendentes) liberar();
  await browser?.close();
  servidor.close();
  servidor.closeAllConnections();
  await Promise.all([db.destroy(), admin.destroy()]);
}
