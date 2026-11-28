import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { env } from '../config/env';
import { carregarRecursosOperacionais } from '../config/recursosOperacionais';
import { AppError } from '../errors/AppError';
import { solicitacaoSvoExternaService } from '../services/solicitacaoSvoExternaService';

vi.mock('../services/solicitacaoSvoExternaService', () => ({
  solicitacaoSvoExternaService: { registrar: vi.fn() },
}));

vi.mock('../middlewares/protegerPortalSvo', async (importOriginal) => {
  const original = await importOriginal<typeof import('../middlewares/protegerPortalSvo')>();
  // Estes casos exercitam o contrato HTTP e as cotas têm suíte própria com PostgreSQL real.
  const executarSemCotas: typeof original.protegerTrabalhoPortalSvo = (_operacao, executar) => executar;
  return { ...original, protegerTrabalhoPortalSvo: executarSemCotas };
});

// Todos os dados são sintéticos
const URL = '/api/solicitacoes-svo/externas';
const CHAVE = 'tentativa-teste-0001';
const PROVA = 'P'.repeat(43);
const CPF_SENTINELA = '529.982.247-25';
const NOME_SENTINELA = 'Nome Sentinela Sintetico';

const payload = {
  tipo_solicitante: 'PESSOA_FISICA',
  nome_solicitante: NOME_SENTINELA,
  telefone_solicitante: '(79) 99999-0000',
  email_solicitante: 'sentinela@example.com',
  cpf_solicitante: CPF_SENTINELA,
  nome_falecido: 'Falecido Sintetico',
  local_ocorrencia: 'Rua Ficticia dos Testes',
  numero_imovel: '10',
  descricao_ocorrencia: 'Descricao sintetica da ocorrencia.',
  data_hora_ocorrencia: '2026-01-10T10:00:00-03:00',
  ciencia_aviso_privacidade: true,
  versao_aviso_privacidade: '2026-11-v1',
};

const resultado = {
  criada: true,
  protocolo: 'SVO-20261127-ABCDEFGHJKLM',
  credencial: 'C'.repeat(43),
  registradaEm: '2026-11-27T15:00:00.000Z',
};

const enviar = (corpo: unknown = payload, cabecalhos: Record<string, string> = { 'Idempotency-Key': CHAVE, 'X-Prova-Tentativa': PROVA }) =>
  request(app).post(URL).set(cabecalhos).send(corpo as object);

const faseOriginal = env.recursosOperacionais;
const ligar = () => { env.recursosOperacionais = carregarRecursosOperacionais({ PORTAL_SVO_ATIVO: 'true' }); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(solicitacaoSvoExternaService.registrar).mockResolvedValue(resultado);
  ligar();
});

afterEach(() => {
  env.recursosOperacionais = faseOriginal;
  vi.restoreAllMocks();
});

describe('POST /api/solicitacoes-svo/externas (SCRUM-264, rota pública)', () => {
  it('com a flag desligada responde 404 sem chamar o serviço', async () => {
    env.recursosOperacionais = carregarRecursosOperacionais({});
    const resposta = await enviar();
    expect(resposta.status).toBe(404);
    expect(resposta.body.codigo).toBe('RECURSO_DESATIVADO');
    expect(resposta.headers['cache-control']).toContain('no-store');
    expect(solicitacaoSvoExternaService.registrar).not.toHaveBeenCalled();
  });

  it('cria sem exigir login e devolve só o mínimo, sem cache', async () => {
    const resposta = await enviar();
    expect(resposta.status).toBe(201);
    expect(resposta.headers['cache-control']).toContain('no-store');
    expect(resposta.body).toEqual({
      protocolo: resultado.protocolo,
      credencial: resultado.credencial,
      status: 'RECEBIDA',
      status_label: 'Recebida',
      registrada_em: resultado.registradaEm,
    });
    expect(solicitacaoSvoExternaService.registrar).toHaveBeenCalledTimes(1);
    const [dados, tentativa] = vi.mocked(solicitacaoSvoExternaService.registrar).mock.calls[0]!;
    expect(dados.cpf_solicitante).toBe('52998224725');
    expect(dados.data_hora_ocorrencia).toBe('2026-01-10T13:00:00.000Z');
    expect(tentativa).toEqual({ chaveIdempotencia: CHAVE, provaTentativa: PROVA });
  });

  it('repetição da mesma tentativa responde 200 com o mesmo resultado', async () => {
    vi.mocked(solicitacaoSvoExternaService.registrar).mockResolvedValue({ ...resultado, criada: false });
    const resposta = await enviar();
    expect(resposta.status).toBe(200);
    expect(resposta.body.protocolo).toBe(resultado.protocolo);
    expect(resposta.body.credencial).toBe(resultado.credencial);
  });

  it('exige Idempotency-Key e X-Prova-Tentativa válidos', async () => {
    const casos: Record<string, string>[] = [
      {},
      { 'Idempotency-Key': CHAVE },
      { 'X-Prova-Tentativa': PROVA },
      { 'Idempotency-Key': 'curta', 'X-Prova-Tentativa': PROVA },
      { 'Idempotency-Key': CHAVE, 'X-Prova-Tentativa': 'curta' },
    ];
    for (const cabecalhos of casos) {
      const resposta = await enviar(payload, cabecalhos);
      expect(resposta.status).toBe(400);
    }
    expect(solicitacaoSvoExternaService.registrar).not.toHaveBeenCalled();
  });

  it.each(['status', 'canal_origem', 'registrante_id', 'protocolo', 'destino', 'gestor_id', 'prioridade'])(
    'rejeita o campo operacional %s',
    async (campo) => {
      const resposta = await enviar({ ...payload, [campo]: 'x' });
      expect(resposta.status).toBe(400);
      expect(solicitacaoSvoExternaService.registrar).not.toHaveBeenCalled();
    },
  );

  it('rejeita campos inválidos sem repetir dados pessoais na resposta nem nos logs', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    logs.forEach((espiao) => espiao.mockImplementation(() => {}));
    const resposta = await enviar({ ...payload, cpf_solicitante: '529.982.247-26', data_hora_ocorrencia: 'ontem' });
    expect(resposta.status).toBe(400);
    const tudo = JSON.stringify([resposta.body, logs.map((espiao) => espiao.mock.calls)]);
    for (const sentinela of ['529.982.247-26', '52998224726', NOME_SENTINELA, 'sentinela@example.com']) {
      expect(tudo).not.toContain(sentinela);
    }
  });

  it('corpo acima do teto de 100 KB responde 413 sem chamar o serviço', async () => {
    const resposta = await enviar({ ...payload, descricao_ocorrencia: 'a'.repeat(150_000) });
    expect(resposta.status).toBe(413);
    expect(solicitacaoSvoExternaService.registrar).not.toHaveBeenCalled();
  });

  it('rejeita parâmetros na URL sem chamar o serviço', async () => {
    const resposta = await request(app)
      .post(`${URL}?cpf=${CPF_SENTINELA}`)
      .set({ 'Idempotency-Key': CHAVE, 'X-Prova-Tentativa': PROVA })
      .send(payload);
    expect(resposta.status).toBe(400);
    expect(resposta.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(resposta.body)).not.toContain(CPF_SENTINELA);
    expect(solicitacaoSvoExternaService.registrar).not.toHaveBeenCalled();
  });

  it('mantém no-store nos erros antecipados: JSON inválido e corpo acima de 100 KB', async () => {
    const invalido = await request(app)
      .post(URL)
      .set({ 'Content-Type': 'application/json', 'Idempotency-Key': CHAVE, 'X-Prova-Tentativa': PROVA })
      .send('{"nome_solicitante": ');
    expect(invalido.status).toBe(400);
    expect(invalido.headers['cache-control']).toContain('no-store');

    const grande = await enviar({ ...payload, descricao_ocorrencia: 'a'.repeat(150_000) });
    expect(grande.status).toBe(413);
    expect(grande.headers['cache-control']).toContain('no-store');
    expect(solicitacaoSvoExternaService.registrar).not.toHaveBeenCalled();
  });

  it('preflight libera só os cabeçalhos da tentativa para a origem permitida', async () => {
    const origem = env.corsOrigens[0] as string;
    const resposta = await request(app)
      .options(URL)
      .set('Origin', origem)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,idempotency-key,x-prova-tentativa');
    expect(resposta.status).toBe(204);
    expect(resposta.headers['access-control-allow-origin']).toBe(origem);
    expect(resposta.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    expect(resposta.headers['access-control-allow-headers']).toContain('X-Prova-Tentativa');
    expect(resposta.headers['access-control-allow-headers']).not.toContain('*');
  });

  it('erro interno responde genérico, sem dado pessoal', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error')];
    logs.forEach((espiao) => espiao.mockImplementation(() => {}));
    vi.mocked(solicitacaoSvoExternaService.registrar).mockRejectedValue(new Error(`falha com ${CPF_SENTINELA}`));
    const resposta = await enviar();
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ erro: 'Erro interno do servidor' });
    expect(JSON.stringify(logs.map((espiao) => espiao.mock.calls))).not.toContain(CPF_SENTINELA);
  });

  it('erro previsto do serviço mantém o status e a mensagem', async () => {
    vi.mocked(solicitacaoSvoExternaService.registrar).mockRejectedValue(
      new AppError('Chave de idempotência já usada com outro conteúdo', 409, 'IDEMPOTENCIA_CONFLITO'),
    );
    const resposta = await enviar();
    expect(resposta.status).toBe(409);
    expect(resposta.body.codigo).toBe('IDEMPOTENCIA_CONFLITO');
  });
});

describe('rotas internas continuam protegidas', () => {
  it.each([
    ['get', '/api/solicitacoes-svo'],
    ['get', '/api/solicitacoes-svo/1'],
    ['post', '/api/solicitacoes-svo'],
    ['patch', '/api/solicitacoes-svo/1/confirmar'],
    ['patch', '/api/solicitacoes-svo/1/recusar'],
  ] as const)('%s %s sem login responde 401', async (metodo, caminho) => {
    const resposta = await request(app)[metodo](caminho).send({});
    expect(resposta.status).toBe(401);
  });
});
