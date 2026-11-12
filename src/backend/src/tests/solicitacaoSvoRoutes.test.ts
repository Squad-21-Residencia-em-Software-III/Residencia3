import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/solicitacaoSvoService', () => ({
  solicitacaoSvoService: {
    registrar: vi.fn(),
    listar: vi.fn(),
    buscarPorId: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { solicitacaoSvoService } from '../services/solicitacaoSvoService';

const autenticarComo = (perfil: Perfil, id = 3) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

const solicitacaoRegistrada = {
  id: 10,
  registrante_id: 3,
  dados_solicitante: 'Maria Souza - filha - (79) 99999-0000',
  local_ocorrencia: 'Rua A, 123 - Aracaju',
  material_sensivel: false,
  status: 'EM_TRIAGEM' as const,
};

describe('Rotas de Solicitações SVO (/api/solicitacoes-svo)', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_SVO);
  });

  describe('POST /api/solicitacoes-svo', () => {
    const payloadValido = {
      dados_solicitante: '  Maria Souza - filha - (79) 99999-0000  ',
      local_ocorrencia: 'Rua A, 123 - Aracaju',
    };

    it('registra a solicitação em triagem com o usuário autenticado como registrante', async () => {
      vi.mocked(solicitacaoSvoService.registrar).mockResolvedValueOnce(solicitacaoRegistrada);

      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send(payloadValido);

      expect(resposta.status).toBe(201);
      expect(resposta.headers.location).toBe('/api/solicitacoes-svo/10');
      expect(resposta.body.status).toBe('EM_TRIAGEM');
      expect(solicitacaoSvoService.registrar).toHaveBeenCalledWith(
        {
          dados_solicitante: 'Maria Souza - filha - (79) 99999-0000',
          local_ocorrencia: 'Rua A, 123 - Aracaju',
          material_sensivel: false,
        },
        3,
      );
    });

    it('aceita material_sensivel informado', async () => {
      vi.mocked(solicitacaoSvoService.registrar).mockResolvedValueOnce({
        ...solicitacaoRegistrada,
        material_sensivel: true,
      });

      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send({ ...payloadValido, material_sensivel: true });

      expect(resposta.status).toBe(201);
      expect(vi.mocked(solicitacaoSvoService.registrar).mock.calls[0]?.[0].material_sensivel).toBe(true);
    });

    it('permite registro pelo administrador', async () => {
      autenticarComo(PERFIS.ADMINISTRADOR, 1);
      vi.mocked(solicitacaoSvoService.registrar).mockResolvedValueOnce({ ...solicitacaoRegistrada, registrante_id: 1 });

      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send(payloadValido);

      expect(resposta.status).toBe(201);
      expect(vi.mocked(solicitacaoSvoService.registrar).mock.calls[0]?.[1]).toBe(1);
    });

    it('rejeita quando faltam campos obrigatórios', async () => {
      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send({});

      expect(resposta.status).toBe(400);
      const campos = resposta.body.detalhes.map((d: { campo: string }) => d.campo);
      expect(campos).toEqual(expect.arrayContaining(['dados_solicitante', 'local_ocorrencia']));
      expect(solicitacaoSvoService.registrar).not.toHaveBeenCalled();
    });

    it('rejeita campos compostos apenas por espaços', async () => {
      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send({ dados_solicitante: '   ', local_ocorrencia: '   ' });

      expect(resposta.status).toBe(400);
      expect(solicitacaoSvoService.registrar).not.toHaveBeenCalled();
    });

    it('rejeita local_ocorrencia com mais de 255 caracteres', async () => {
      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send({ ...payloadValido, local_ocorrencia: 'a'.repeat(256) });

      expect(resposta.status).toBe(400);
      expect(solicitacaoSvoService.registrar).not.toHaveBeenCalled();
    });

    it('rejeita material_sensivel que não seja booleano', async () => {
      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send({ ...payloadValido, material_sensivel: 'sim' });

      expect(resposta.status).toBe(400);
      expect(solicitacaoSvoService.registrar).not.toHaveBeenCalled();
    });

    it.each(['status', 'registrante_id'])('não permite que o cliente defina %s', async (campo) => {
      const resposta = await request(app)
        .post('/api/solicitacoes-svo')
        .set('Authorization', token)
        .send({ ...payloadValido, [campo]: campo === 'status' ? 'CONCLUIDA' : 99 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.detalhes[0].campo).toBe(campo);
      expect(solicitacaoSvoService.registrar).not.toHaveBeenCalled();
    });

    it('exige autenticação', async () => {
      const resposta = await request(app).post('/api/solicitacoes-svo').send(payloadValido);

      expect(resposta.status).toBe(401);
      expect(solicitacaoSvoService.registrar).not.toHaveBeenCalled();
    });

    it.each([PERFIS.MOTORISTA_SVO, PERFIS.GESTOR_FROTA, PERFIS.SOLICITANTE])(
      'bloqueia o perfil %s',
      async (perfil) => {
        autenticarComo(perfil);

        const resposta = await request(app)
          .post('/api/solicitacoes-svo')
          .set('Authorization', token)
          .send(payloadValido);

        expect(resposta.status).toBe(403);
        expect(solicitacaoSvoService.registrar).not.toHaveBeenCalled();
      },
    );
  });

  describe('GET /api/solicitacoes-svo', () => {
    it('lista as solicitações', async () => {
      vi.mocked(solicitacaoSvoService.listar).mockResolvedValueOnce([solicitacaoRegistrada]);

      const resposta = await request(app).get('/api/solicitacoes-svo').set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveLength(1);
      expect(solicitacaoSvoService.listar).toHaveBeenCalledWith(undefined);
    });

    it('filtra pela fila de triagem', async () => {
      vi.mocked(solicitacaoSvoService.listar).mockResolvedValueOnce([solicitacaoRegistrada]);

      const resposta = await request(app)
        .get('/api/solicitacoes-svo?status=EM_TRIAGEM')
        .set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(solicitacaoSvoService.listar).toHaveBeenCalledWith('EM_TRIAGEM');
    });

    it.each(['CONFIRMADA', 'RECUSADA'] as const)(
      'aceita o status %s no filtro',
      async (status) => {
        vi.mocked(solicitacaoSvoService.listar).mockResolvedValueOnce([
          { ...solicitacaoRegistrada, status },
        ]);

        const resposta = await request(app)
          .get(`/api/solicitacoes-svo?status=${status}`)
          .set('Authorization', token);

        expect(resposta.status).toBe(200);
        expect(solicitacaoSvoService.listar).toHaveBeenCalledWith(status);
      },
    );
    it('rejeita status inválido no filtro', async () => {
      const resposta = await request(app)
        .get('/api/solicitacoes-svo?status=QUALQUER')
        .set('Authorization', token);

      expect(resposta.status).toBe(400);
      expect(solicitacaoSvoService.listar).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/solicitacoes-svo/:id', () => {
    it('retorna a solicitação', async () => {
      vi.mocked(solicitacaoSvoService.buscarPorId).mockResolvedValueOnce(solicitacaoRegistrada);

      const resposta = await request(app).get('/api/solicitacoes-svo/10').set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe(10);
      expect(solicitacaoSvoService.buscarPorId).toHaveBeenCalledWith(10);
    });

    it('retorna 404 quando não existe', async () => {
      vi.mocked(solicitacaoSvoService.buscarPorId).mockRejectedValueOnce(
        new AppError('Solicitação SVO não encontrada', 404),
      );

      const resposta = await request(app).get('/api/solicitacoes-svo/999').set('Authorization', token);

      expect(resposta.status).toBe(404);
    });

    it('rejeita id inválido', async () => {
      const resposta = await request(app).get('/api/solicitacoes-svo/abc').set('Authorization', token);

      expect(resposta.status).toBe(400);
      expect(solicitacaoSvoService.buscarPorId).not.toHaveBeenCalled();
    });
  });
});
