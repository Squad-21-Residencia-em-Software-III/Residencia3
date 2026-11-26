import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Os serviços destas suítes são simulados; os registros consultados pelo controle de frota também.
vi.mock('../config/database', () => ({ db: () => ({ where: () => ({ first: async () => ({ veiculo_id: 1, tipo_frota: 'ADMINISTRATIVA' }) }) }) }));

// Matriz de acesso (docs/matriz-de-acesso.md) validada contra o app real: autenticação,
// autorizar(...) e exigirAssociacaoSvo. Os services são substituídos por stubs que sempre
// respondem, para que só a camada de permissão decida o resultado.
const { stubDeService, associadoAoSvo } = vi.hoisted(() => ({
  stubDeService: () =>
    new Proxy(
      {},
      {
        get: (_alvo, chave) => (typeof chave === 'string' && chave !== 'then' ? async () => ({}) : undefined),
      }
    ),
  associadoAoSvo: { valor: true },
}));

vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../models/unidadeModel', () => ({
  unidadeModel: { estaAssociadoPorNome: vi.fn(async () => associadoAoSvo.valor) },
}));
vi.mock('../services/abastecimentoService', () => ({ abastecimentoService: stubDeService() }));
vi.mock('../services/auditoriaService', () => ({ auditoriaService: stubDeService() }));
vi.mock('../services/dashboardService', () => ({ dashboardService: stubDeService() }));
vi.mock('../services/disponibilidadeService', () => ({ disponibilidadeService: stubDeService() }));
vi.mock('../services/documentoService', () => ({ documentoService: stubDeService() }));
vi.mock('../services/manutencaoService', () => ({ manutencaoService: stubDeService() }));
vi.mock('../services/motoristaService', () => ({ motoristaService: stubDeService() }));
vi.mock('../services/multaService', () => ({ multaService: stubDeService() }));
vi.mock('../services/notificacaoService', () => ({ notificacaoService: stubDeService() }));
vi.mock('../services/solicitacaoSvoService', () => ({ solicitacaoSvoService: stubDeService() }));
vi.mock('../services/solicitacaoViagemService', () => ({ solicitacaoViagemService: stubDeService() }));
vi.mock('../services/unidadeService', () => ({ unidadeService: stubDeService() }));
vi.mock('../services/usuarioService', () => ({ usuarioService: stubDeService() }));
vi.mock('../services/veiculoService', () => ({ veiculoService: stubDeService() }));
vi.mock('../services/viagemService', () => ({ viagemService: stubDeService() }));

import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { app } from '../app';
import { authService } from '../services/authService';

const { ADMINISTRADOR: A, SOLICITANTE: S, GESTOR_FROTA: GF, GESTOR_SVO: GS, MOTORISTA_FROTA: MF, MOTORISTA_SVO: MS } =
  PERFIS;
const TODOS: Perfil[] = [A, S, GF, GS, MF, MS];

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';
// [método, rota, perfis permitidos, exige associação à unidade SVO para o Gestor SVO]
type Regra = [Metodo, string, Perfil[], boolean?];

const MATRIZ: Regra[] = [
  ['get', '/api/auth/me', TODOS],
  ['patch', '/api/auth/senha', TODOS],

  ['get', '/api/usuarios/perfis', [A]],
  ['get', '/api/usuarios', [A]],
  ['post', '/api/usuarios', [A]],
  ['get', '/api/usuarios/1', [A]],
  ['patch', '/api/usuarios/1', [A]],
  ['patch', '/api/usuarios/1/senha', [A]],

  ['get', '/api/veiculos/svo/disponiveis', [A, GS], true],
  ['get', '/api/veiculos/svo/ocupacao', [A, GS], true],
  ['get', '/api/veiculos', [A, GF, GS, MF, MS], true],
  ['post', '/api/veiculos', [A, GF, GS], true],
  ['put', '/api/veiculos/1', [A, GF, GS], true],

  ['post', '/api/abastecimentos', [A, GF, MF, MS]],
  ['get', '/api/abastecimentos/veiculo/1', [A, GF, MF, MS]],

  ['get', '/api/solicitacoes-viagem', [A, GF]],
  ['get', '/api/solicitacoes-viagem/minhas', TODOS],
  ['post', '/api/solicitacoes-viagem', [A, S, GF, GS]],
  ['get', '/api/solicitacoes-viagem/1/disponibilidade', [A, GF]],
  ['patch', '/api/solicitacoes-viagem/1/aprovar', [A, GF]],
  ['patch', '/api/solicitacoes-viagem/1/recusar', [A, GF]],

  ['post', '/api/manutencoes', [A, GF]],
  ['get', '/api/manutencoes/veiculo/1', [A, GF]],
  ['put', '/api/manutencoes/1', [A, GF]],
  ['patch', '/api/manutencoes/1/status', [A, GF]],
  ['delete', '/api/manutencoes/1', [A, GF]],

  ['get', '/api/documentos/vencimentos', [A, GF]],

  ['get', '/api/multas', [A, GF]],
  ['post', '/api/multas', [A, GF]],
  ['put', '/api/multas/1', [A, GF]],
  ['delete', '/api/multas/1', [A, GF]],

  ['get', '/api/viagens', [A, GF, GS, MF, MS], true],
  ['post', '/api/viagens', [A, GF, GS], true],
  ['patch', '/api/viagens/1/iniciar', [A, GF, GS, MF, MS], true],
  ['patch', '/api/viagens/1/finalizar', [A, GF, GS, MF, MS], true],
  ['patch', '/api/viagens/1/cancelar', [A, GF, GS], true],

  ['get', '/api/motoristas/me', TODOS],
  ['get', '/api/motoristas', [A, GF, GS], true],

  ['get', '/api/unidades', TODOS],
  ['get', '/api/unidades/gestores', [A]],
  ['post', '/api/unidades/1/gestores', [A]],
  ['delete', '/api/unidades/1/gestores/2', [A]],

  ['get', '/api/dashboard', [A, GF]],

  ['get', '/api/solicitacoes-svo', [A, GS], true],
  ['get', '/api/solicitacoes-svo/1', [A, GS], true],
  ['post', '/api/solicitacoes-svo', [A, GS], true],
  ['patch', '/api/solicitacoes-svo/1/confirmar', [A, GS], true],

  ['get', '/api/auditorias', [A]],

  ['get', '/api/notificacoes', TODOS],
  ['get', '/api/notificacoes/contador', TODOS],
  ['patch', '/api/notificacoes/1/lida', TODOS],
  ['patch', '/api/notificacoes/ler-todas', TODOS],
  ['patch', '/api/notificacoes/referencia/lida', TODOS],
];

const chamar = (metodo: Metodo, rota: string, token?: string) => {
  const req = request(app)[metodo](rota).set('Origin', 'http://localhost:5173');
  return token ? req.set('Authorization', `Bearer ${token}`).send({}) : req.send({});
};

const autenticarComo = (perfil: Perfil, ativo = true) =>
  vi.mocked(authService.usuarioDoToken).mockImplementation(async () => {
    if (!ativo) throw new AppError('Usuário inativo. Procure o administrador do sistema.', 403);
    return { id: 7, nome: 'Teste', email: 't@exemplo.com', perfil, tipo_usuario: perfil, ativo } as never;
  });

beforeEach(() => {
  vi.clearAllMocks();
  associadoAoSvo.valor = true;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('Matriz de acesso: sem autenticação', () => {
  it.each(MATRIZ.map(([metodo, rota]) => [metodo.toUpperCase(), rota, metodo] as const))(
    '%s %s exige token (401)',
    async (_m, rota, metodo) => {
      const res = await chamar(metodo, rota);

      expect(res.status).toBe(401);
    }
  );
});

describe('Matriz de acesso: perfis', () => {
  const casos = MATRIZ.flatMap(([metodo, rota, permitidos]) =>
    TODOS.map((perfil) => [metodo.toUpperCase(), rota, perfil, permitidos.includes(perfil), metodo] as const)
  );

  it.each(casos)('%s %s como %s → permitido: %s', async (_m, rota, perfil, permitido, metodo) => {
    autenticarComo(perfil);

    const res = await chamar(metodo, rota, 'token');

    if (permitido) {
      expect([401, 403]).not.toContain(res.status);
    } else {
      expect(res.status).toBe(403);
    }
  });
});

describe('Matriz de acesso: Gestor SVO e a unidade SVO', () => {
  const rotasSvo = MATRIZ.filter(([, , permitidos, exigeSvo]) => exigeSvo && permitidos.includes(GS));
  const rotasSemExigencia = MATRIZ.filter(([, , permitidos, exigeSvo]) => !exigeSvo && permitidos.includes(GS));

  it.each(rotasSvo.map(([m, r]) => [m.toUpperCase(), r, m] as const))(
    '%s %s recusa o Gestor SVO não associado à unidade SVO',
    async (_m, rota, metodo) => {
      autenticarComo(GS);
      associadoAoSvo.valor = false;

      const res = await chamar(metodo, rota, 'token');

      expect(res.status).toBe(403);
      expect(res.body.erro).toBe('Você não está associado à unidade SVO');
    }
  );

  it.each(rotasSemExigencia.map(([m, r]) => [m.toUpperCase(), r, m] as const))(
    '%s %s não depende da associação SVO',
    async (_m, rota, metodo) => {
      autenticarComo(GS);
      associadoAoSvo.valor = false;

      const res = await chamar(metodo, rota, 'token');

      expect(res.body.erro).not.toBe('Você não está associado à unidade SVO');
    }
  );

  it('não exige associação dos demais perfis', async () => {
    associadoAoSvo.valor = false;
    for (const perfil of [A, GF]) {
      autenticarComo(perfil);
      const res = await chamar('get', '/api/veiculos', 'token');
      expect([401, 403]).not.toContain(res.status);
    }
  });
});

describe('Matriz de acesso: usuário inativo', () => {
  it.each([A, GF, MF])('o %s inativo recebe 403 mesmo em rota permitida ao perfil', async (perfil) => {
    autenticarComo(perfil, false);

    const res = await chamar('get', '/api/viagens', 'token');

    expect(res.status).toBe(403);
  });
});
