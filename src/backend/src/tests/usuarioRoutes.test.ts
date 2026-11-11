import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/usuarioService', () => ({
  usuarioService: {
    listarPerfis: vi.fn().mockReturnValue([
      { perfil: 'ADMINISTRADOR', descricao: 'Gerenciamento' },
      { perfil: 'SOLICITANTE', descricao: 'Solicitações' },
    ]),
    listar: vi.fn().mockResolvedValue({
      dados: [
        {
          id: 1,
          nome: 'Carlos Silva',
          email: 'admin@exemplo.com',
          tipo_usuario: 'ADMINISTRADOR',
          perfil: 'ADMINISTRADOR',
          ativo: true,
        },
      ],
      paginacao: { pagina: 1, limite: 20, total: 1, totalPaginas: 1 },
    }),
    buscarPorId: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    redefinirSenha: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { usuarioService } from '../services/usuarioService';

const autenticarComo = (perfil: Perfil, id = 1) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('Rotas de Usuários (/api/usuarios)', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.ADMINISTRADOR);
  });

  describe('GET /api/usuarios', () => {
    it('deve listar usuários com paginação para o Administrador', async () => {
      const resposta = await request(app).get('/api/usuarios').set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body.dados).toHaveLength(1);
      expect(resposta.body.paginacao).toMatchObject({ pagina: 1, limite: 20 });
    });

    it('deve repassar filtros de busca, perfil e ativo', async () => {
      await request(app)
        .get('/api/usuarios?pagina=2&limite=10&busca=carlos&perfil=ADMINISTRADOR&ativo=true')
        .set('Authorization', token);

      expect(usuarioService.listar).toHaveBeenCalledWith({
        pagina: 2,
        limite: 10,
        busca: 'carlos',
        perfil: 'ADMINISTRADOR',
        ativo: true,
      });
    });

    it('deve retornar 403 para usuários que não sejam Administrador', async () => {
      autenticarComo(PERFIS.GESTOR_FROTA);

      const resposta = await request(app).get('/api/usuarios').set('Authorization', token);
      expect(resposta.status).toBe(403);
    });
  });

  describe('POST /api/usuarios', () => {
    const usuarioValido = {
      nome: 'Maria Souza',
      email: 'maria@exemplo.com',
      senha: 'SenhaForte@123',
      perfil: 'SOLICITANTE',
    };

    it('deve criar usuário e retornar 201 com location', async () => {
      vi.mocked(usuarioService.criar).mockResolvedValueOnce({
        id: 2,
        nome: usuarioValido.nome,
        email: usuarioValido.email,
        tipo_usuario: 'SOLICITANTE',
        perfil: 'SOLICITANTE',
        ativo: true,
      });

      const resposta = await request(app)
        .post('/api/usuarios')
        .set('Authorization', token)
        .send(usuarioValido);

      expect(resposta.status).toBe(201);
      expect(resposta.headers.location).toBe('/api/usuarios/2');
      expect(resposta.body).toMatchObject({ id: 2, email: 'maria@exemplo.com' });
    });

    it('deve rejeitar senha fraca (< 8 caracteres ou sem maiúscula/símbolo)', async () => {
      const resposta = await request(app)
        .post('/api/usuarios')
        .set('Authorization', token)
        .send({ ...usuarioValido, senha: 'fraca' });

      expect(resposta.status).toBe(400);
      expect(usuarioService.criar).not.toHaveBeenCalled();
    });

    it('deve retornar 409 quando o serviço apontar e-mail duplicado', async () => {
      vi.mocked(usuarioService.criar).mockRejectedValueOnce(
        new AppError('Já existe um usuário cadastrado com este e-mail', 409),
      );

      const resposta = await request(app)
        .post('/api/usuarios')
        .set('Authorization', token)
        .send(usuarioValido);

      expect(resposta.status).toBe(409);
    });
  });

  describe('PATCH /api/usuarios/:id', () => {
    it('deve atualizar campos permitidos (nome, perfil, ativo)', async () => {
      vi.mocked(usuarioService.atualizar).mockResolvedValueOnce({
        id: 2,
        nome: 'Maria Silva',
        email: 'maria@exemplo.com',
        tipo_usuario: 'SOLICITANTE',
        perfil: 'SOLICITANTE',
        ativo: false,
      });

      const resposta = await request(app)
        .patch('/api/usuarios/2')
        .set('Authorization', token)
        .send({ nome: 'Maria Silva', ativo: false });

      expect(resposta.status).toBe(200);
      expect(usuarioService.atualizar).toHaveBeenCalledWith(2, { nome: 'Maria Silva', ativo: false }, 1);
    });

    it('deve rejeitar tentativa de alteração de senha nesta rota (strictObject)', async () => {
      const resposta = await request(app)
        .patch('/api/usuarios/2')
        .set('Authorization', token)
        .send({ senha: 'OutraSenha@123' });

      expect(resposta.status).toBe(400);
      expect(usuarioService.atualizar).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/usuarios/:id/senha', () => {
    it('deve redefinir senha e retornar 204', async () => {
      const resposta = await request(app)
        .patch('/api/usuarios/2/senha')
        .set('Authorization', token)
        .send({ senha: 'NovaSenha@456' });

      expect(resposta.status).toBe(204);
      expect(usuarioService.redefinirSenha).toHaveBeenCalledWith(2, 'NovaSenha@456', 1);
    });

    it('deve retornar 400 se a nova senha for fraca', async () => {
      const resposta = await request(app)
        .patch('/api/usuarios/2/senha')
        .set('Authorization', token)
        .send({ senha: '123' });

      expect(resposta.status).toBe(400);
      expect(usuarioService.redefinirSenha).not.toHaveBeenCalled();
    });
  });
});

