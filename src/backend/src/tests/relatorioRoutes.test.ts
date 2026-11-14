import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Response as RespostaHttp } from 'superagent';

import { PERFIS, type Perfil } from '../constants/perfis';
import { LIMITE_LINHAS_EXPORTACAO } from '../constants/relatorios';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../models/relatorioModel', () => ({
  relatorioModel: {
    viagens: vi.fn(),
    abastecimentos: vi.fn(),
    manutencoes: vi.fn(),
    multas: vi.fn(),
  },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { RELATORIOS: 'RELATORIOS' },
}));

import { app } from '../app';
import { auditoriaModel } from '../models/auditoriaModel';
import { relatorioModel } from '../models/relatorioModel';
import { authService } from '../services/authService';

const token = 'Bearer token-teste';

const autenticarComo = (perfil: Perfil, id = 7) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

const abastecimento = {
  id: 1,
  data_abastecimento: '2026-11-12',
  veiculo_placa: 'ABC1D23',
  veiculo_modelo: 'Fiat Strada',
  motorista_nome: 'João Silva',
  fornecedor_nome: 'Posto X',
  posto_combustivel: 'Centro',
  quilometragem: 1500,
  litros: '40.00',
  valor_total: '250.00',
  preco_por_litro: '6.25',
};

// Entrega o corpo binário (o .xlsx) como Buffer
const comoBuffer = (res: RespostaHttp, retorno: (erro: Error | null, corpo: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => retorno(null, Buffer.concat(partes)));
};

beforeEach(() => {
  vi.clearAllMocks();
  autenticarComo(PERFIS.GESTOR_FROTA);
  vi.mocked(relatorioModel.viagens).mockResolvedValue([]);
  vi.mocked(relatorioModel.abastecimentos).mockResolvedValue([]);
  vi.mocked(relatorioModel.manutencoes).mockResolvedValue([]);
  vi.mocked(relatorioModel.multas).mockResolvedValue([]);
});

describe('GET /api/relatorios', () => {
  it('lista os relatórios disponíveis e os formatos para o Gestor de Frota', async () => {
    const resposta = await request(app).get('/api/relatorios').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body.map((relatorio: { tipo: string }) => relatorio.tipo)).toEqual([
      'viagens',
      'abastecimentos',
      'manutencoes',
      'multas',
    ]);
    expect(resposta.body[0].formatos).toEqual(['csv', 'xlsx']);
  });

  it('exige autenticação', async () => {
    const resposta = await request(app).get('/api/relatorios');

    expect(resposta.status).toBe(401);
  });
});

describe('GET /api/relatorios/:tipo/exportar — permissões (RF18)', () => {
  it.each([PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA])('permite a exportação para %s', async (perfil) => {
    autenticarComo(perfil);

    const resposta = await request(app)
      .get('/api/relatorios/abastecimentos/exportar?formato=csv')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
  });

  it.each([PERFIS.SOLICITANTE, PERFIS.GESTOR_SVO, PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO])(
    'bloqueia %s sem consultar nem auditar',
    async (perfil) => {
      autenticarComo(perfil);

      const resposta = await request(app)
        .get('/api/relatorios/abastecimentos/exportar?formato=csv')
        .set('Authorization', token);

      expect(resposta.status).toBe(403);
      expect(relatorioModel.abastecimentos).not.toHaveBeenCalled();
      expect(auditoriaModel.registrar).not.toHaveBeenCalled();
    },
  );

  it('exige autenticação', async () => {
    const resposta = await request(app).get('/api/relatorios/multas/exportar?formato=csv');

    expect(resposta.status).toBe(401);
  });

  it('limita as viagens do Gestor de Frota às administrativas', async () => {
    await request(app).get('/api/relatorios/viagens/exportar?formato=csv').set('Authorization', token);

    expect(relatorioModel.viagens).toHaveBeenCalledWith(['ADMINISTRATIVA'], {}, LIMITE_LINHAS_EXPORTACAO + 1);
  });

  it('inclui as ordens SVO nas viagens do Administrador', async () => {
    autenticarComo(PERFIS.ADMINISTRADOR);

    await request(app).get('/api/relatorios/viagens/exportar?formato=csv').set('Authorization', token);

    expect(relatorioModel.viagens).toHaveBeenCalledWith(
      ['ADMINISTRATIVA', 'SVO'],
      {},
      LIMITE_LINHAS_EXPORTACAO + 1,
    );
  });
});

describe('GET /api/relatorios/:tipo/exportar — arquivos (RN20)', () => {
  it('exporta CSV com cabeçalhos de download, BOM e células formatadas', async () => {
    vi.mocked(relatorioModel.abastecimentos).mockResolvedValueOnce([abastecimento]);

    const resposta = await request(app)
      .get('/api/relatorios/abastecimentos/exportar?formato=csv&inicio=2026-11-01&fim=2026-11-13')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toContain('text/csv; charset=utf-8');
    expect(resposta.headers['content-disposition']).toMatch(
      /^attachment; filename="relatorio-abastecimentos-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(resposta.headers['access-control-expose-headers']).toBe('Content-Disposition');
    expect(resposta.headers['cache-control']).toBe('no-store');

    const linhas = resposta.text.replace('\uFEFF', '').trim().split('\r\n');
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toContain('ID;Data;Placa;Veículo;Motorista;Fornecedor;Posto');
    expect(linhas[1]).toBe('1;12/11/2026;ABC1D23;Fiat Strada;João Silva;Posto X;Centro;1500;40,00;250,00;6,25');
    expect(relatorioModel.abastecimentos).toHaveBeenCalledWith(
      { inicio: '2026-11-01', fim: '2026-11-13' },
      LIMITE_LINHAS_EXPORTACAO + 1,
    );
  });

  it('exporta XLSX com o tipo de conteúdo do Excel', async () => {
    vi.mocked(relatorioModel.multas).mockResolvedValueOnce([
      {
        id: 9,
        data_infracao: new Date('2026-11-10T15:00:00Z'),
        veiculo_placa: 'ABC1D23',
        valor: '195.23',
        pontos: 5,
        status_pagamento: 'PENDENTE',
      },
    ]);

    const resposta = await request(app)
      .get('/api/relatorios/multas/exportar?formato=xlsx')
      .set('Authorization', token)
      .buffer(true)
      .parse(comoBuffer);

    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(resposta.headers['content-disposition']).toMatch(/filename="relatorio-multas-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    // assinatura de um arquivo ZIP, formato do .xlsx
    expect((resposta.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('exporta relatório vazio apenas com o cabeçalho', async () => {
    const resposta = await request(app).get('/api/relatorios/manutencoes/exportar?formato=csv').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.text.replace('\uFEFF', '').trim().split('\r\n')).toHaveLength(1);
  });

  it('registra a exportação na auditoria', async () => {
    autenticarComo(PERFIS.ADMINISTRADOR, 3);
    vi.mocked(relatorioModel.manutencoes).mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await request(app)
      .get('/api/relatorios/manutencoes/exportar?formato=csv&inicio=2026-11-01')
      .set('Authorization', token);

    expect(auditoriaModel.registrar).toHaveBeenCalledWith({
      usuario_id: 3,
      acao: 'EXPORTOU_RELATORIO tipo=manutencoes formato=csv linhas=2 inicio=2026-11-01 fim=-',
      modulo: 'RELATORIOS',
    });
  });

  it('retorna 422 quando o resultado passa do limite de linhas, sem auditar', async () => {
    vi.mocked(relatorioModel.multas).mockResolvedValueOnce(
      Array.from({ length: LIMITE_LINHAS_EXPORTACAO + 1 }, (_, i) => ({ id: i })),
    );

    const resposta = await request(app).get('/api/relatorios/multas/exportar?formato=csv').set('Authorization', token);

    expect(resposta.status).toBe(422);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });
});

describe('GET /api/relatorios/:tipo/exportar — validação', () => {
  it.each([
    ['formato ausente', '/api/relatorios/multas/exportar'],
    ['formato não suportado', '/api/relatorios/multas/exportar?formato=pdf'],
    ['tipo inexistente', '/api/relatorios/estoque/exportar?formato=csv'],
    ['data inicial inválida', '/api/relatorios/multas/exportar?formato=csv&inicio=13/11/2026'],
    ['período invertido', '/api/relatorios/multas/exportar?formato=csv&inicio=2026-11-13&fim=2026-11-01'],
  ])('retorna 400 para %s, sem consultar o banco', async (_descricao, url) => {
    const resposta = await request(app).get(url).set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(relatorioModel.multas).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });
});
