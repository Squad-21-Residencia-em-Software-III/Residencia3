import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import AuditoriaPage from '../AuditoriaPage';
import { auditoriaApi } from '../../services/api/auditoriaApi';
import { evidenciasOdometroApi } from '../../services/api/evidenciasOdometroApi';
import { ApiError } from '../../services/api/http';
import type { EvidenciaOdometro, EvidenciasDaViagem } from '../../types/evidenciaOdometro';
import { podeEditarFrota, perfilPode } from '../../utils/permissoes';
import { ModalEvidenciasOdometro } from './ModalEvidenciasOdometro';

vi.mock('../../services/api/evidenciasOdometroApi', () => ({
  evidenciasOdometroApi: { enviar: vi.fn(), consultar: vi.fn(), arquivo: vi.fn() },
}));
vi.mock('../../services/api/auditoriaApi', () => ({ auditoriaApi: { listar: vi.fn() } }));
vi.mock('../../services/api/relatoriosApi', () => ({ salvarBlobNoNavegador: vi.fn() }));

const api = vi.mocked(evidenciasOdometroApi);

const fase = (f: 'SAIDA' | 'CHEGADA', extra: Partial<EvidenciaOdometro> = {}): EvidenciaOdometro => ({
  id: null, fase: f, situacao: 'PENDENTE', km: null, registrada_em: null, autor_nome: null,
  compartilhada: false, excecao: null, pode_baixar: false, ...extra,
});
const dados = (saida: Partial<EvidenciaOdometro>, chegada: Partial<EvidenciaOdometro>): EvidenciasDaViagem => ({
  tipo_operacao: 'SVO', viagem_id: 12, veiculo_placa: 'SVO1A23', motorista_nome: 'Ana',
  saida: fase('SAIDA', saida), chegada: fase('CHEGADA', chegada),
});

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:foto');
  URL.revokeObjectURL = vi.fn();
  api.arquivo.mockResolvedValue({ blob: new Blob(['x'], { type: 'image/jpeg' }), filename: 'saida.jpg' });
});

afterEach(() => {
  RECURSOS_BACKEND.fotosOdometro = false;
});

describe('ModalEvidenciasOdometro (SCRUM-207)', () => {
  it('mostra saída e chegada separadas, com foto pelo proxy autenticado e contexto', async () => {
    api.consultar.mockResolvedValue(dados(
      { id: 'ev-s', situacao: 'REGISTRADA', km: 1000, autor_nome: 'Ana', registrada_em: '2026-11-18T08:00:00Z', pode_baixar: true },
      { id: 'ev-c', situacao: 'REGISTRADA', km: 1080, autor_nome: 'Ana', registrada_em: '2026-11-18T10:00:00Z' },
    ));
    render(<ModalEvidenciasOdometro referencia={{ id: 12, tipo_operacao: 'SVO' }} onClose={vi.fn()} />);

    const saida = await screen.findByRole('region', { name: 'Odômetro na saída' });
    const chegada = screen.getByRole('region', { name: 'Odômetro na chegada' });
    expect(within(saida).getByText('1.000 km')).toBeInTheDocument();
    expect(within(chegada).getByText('1.080 km')).toBeInTheDocument();
    expect(await within(saida).findByAltText('Foto do odômetro na saída da viagem #12')).toBeInTheDocument();
    expect(api.consultar).toHaveBeenCalledWith({ id: 12, tipo_operacao: 'SVO' });
    expect(api.arquivo).toHaveBeenCalledWith('ev-s');
    expect(api.arquivo).toHaveBeenCalledWith('ev-c');

    // Baixar só aparece se o servidor autorizar
    expect(within(saida).getByRole('button', { name: /Baixar original/ })).toBeInTheDocument();
    expect(within(chegada).queryByRole('button', { name: /Baixar original/ })).not.toBeInTheDocument();
    fireEvent.click(within(saida).getByRole('button', { name: /Baixar original/ }));
    await waitFor(() => expect(api.arquivo).toHaveBeenCalledWith('ev-s', true));
  });

  it('exceção, foto expirada e registro antigo aparecem sem foto inventada', async () => {
    api.consultar.mockResolvedValue(dados(
      { situacao: 'EXCECAO_AUTORIZADA', excecao: { justificativa: 'Sem sinal no local', autorizada_por_nome: 'Gestor SVO', autorizada_em: '2026-11-18T08:00:00Z' } },
      { situacao: 'EXPIRADA' },
    ));
    render(<ModalEvidenciasOdometro referencia={{ id: 12, tipo_operacao: 'SVO' }} onClose={vi.fn()} />);

    expect(await screen.findByText(/Transição autorizada sem foto por/)).toHaveTextContent('Sem sinal no local');
    expect(screen.getByText(/descartada após o prazo de guarda de 12 meses/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(api.arquivo).not.toHaveBeenCalled();
  });

  it('acesso negado pelo servidor', async () => {
    api.consultar.mockRejectedValue(new ApiError('Proibido', 403));
    render(<ModalEvidenciasOdometro referencia={{ id: 12, tipo_operacao: 'ADMINISTRATIVA' }} onClose={vi.fn()} />);
    expect(await screen.findByText('Você não tem permissão para ver as fotos desta viagem.')).toBeInTheDocument();
  });
});

describe('Quem vê as fotos (decisão do líder em 18/11)', () => {
  const ver = (perfil: Parameters<typeof perfilPode>[0], tipo: string) =>
    perfilPode(perfil, 'evidenciasOdometro.ver') && podeEditarFrota(perfil, tipo);

  it('Administrador nas duas operações; cada gestor só na sua; motoristas e demais não', () => {
    expect(ver('ADMINISTRADOR', 'ADMINISTRATIVA')).toBe(true);
    expect(ver('ADMINISTRADOR', 'SVO')).toBe(true);
    expect(ver('GESTOR_FROTA', 'ADMINISTRATIVA')).toBe(true);
    expect(ver('GESTOR_FROTA', 'SVO')).toBe(false);
    expect(ver('GESTOR_SVO', 'SVO')).toBe(true);
    expect(ver('GESTOR_SVO', 'ADMINISTRATIVA')).toBe(false);
    for (const perfil of ['MOTORISTA_FROTA', 'MOTORISTA_SVO', 'SOLICITANTE'] as const) {
      expect(ver(perfil, 'ADMINISTRATIVA')).toBe(false);
      expect(ver(perfil, 'SVO')).toBe(false);
    }
  });
});

describe('AuditoriaPage: fotos a partir dos registros de saída e chegada', () => {
  const registros = {
    dados: [
      { id: 3, usuario_id: 1, modulo: 'VIAGENS', data_hora: '2026-11-18T10:00:00Z', acao: 'FINALIZOU_VIAGEM tipo=SVO id=12 km_final=1080' },
      { id: 2, usuario_id: 1, modulo: 'VIAGENS', data_hora: '2026-11-18T08:00:00Z', acao: 'INICIOU_VIAGEM tipo=ADMINISTRATIVA id=12 km_inicial=1000' },
      { id: 1, usuario_id: 1, modulo: 'AUTENTICACAO', data_hora: '2026-11-18T07:00:00Z', acao: 'LOGIN_SUCESSO' },
    ],
    paginacao: { pagina: 1, limite: 20, total: 3, totalPaginas: 1 },
  };

  it('desligado, a tabela fica como antes', async () => {
    vi.mocked(auditoriaApi.listar).mockResolvedValue(registros as never);
    render(<AuditoriaPage />);
    await screen.findByText('LOGIN_SUCESSO');
    expect(screen.queryByText('Comprovação')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver fotos/ })).not.toBeInTheDocument();
  });

  it('ligado, só saídas e chegadas têm "Ver fotos", abrindo a viagem do tipo certo', async () => {
    RECURSOS_BACKEND.fotosOdometro = true;
    vi.mocked(auditoriaApi.listar).mockResolvedValue(registros as never);
    api.consultar.mockResolvedValue(dados({}, {}));
    render(<AuditoriaPage />);
    await screen.findByText('LOGIN_SUCESSO');

    const botoes = screen.getAllByRole('button', { name: /Ver fotos/ });
    expect(botoes).toHaveLength(2);
    fireEvent.click(botoes[1]);
    await waitFor(() => expect(api.consultar).toHaveBeenCalledWith({ tipo_operacao: 'ADMINISTRATIVA', id: 12 }));
    expect(await screen.findByText(/Fotos do odômetro · Viagem administrativa #12/)).toBeInTheDocument();
  });
});
