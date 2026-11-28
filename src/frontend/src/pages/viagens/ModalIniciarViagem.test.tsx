import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { evidenciasOdometroApi } from '../../services/api/evidenciasOdometroApi';
import { ApiError } from '../../services/api/http';
import type { EvidenciaOdometro, EvidenciasDaViagem } from '../../types/evidenciaOdometro';
import type { Viagem } from '../../types/viagem';
import { ModalFinalizarViagem } from './ModalFinalizarViagem';
import { ModalIniciarViagem } from './ModalIniciarViagem';

vi.mock('../../services/api/evidenciasOdometroApi', () => ({
  evidenciasOdometroApi: { enviar: vi.fn(), consultar: vi.fn(), arquivo: vi.fn(), solicitarExcecao: vi.fn() },
}));

const api = vi.mocked(evidenciasOdometroApi);

const viagem = {
  id: 7,
  tipo_operacao: 'ADMINISTRATIVA',
  origem: 'Sede',
  destino: 'Hospital',
  veiculo_modelo: 'Spin',
  veiculo_placa: 'ABC1D23',
  motorista_nome: 'Beto',
  km_inicial: 1000,
  status: 'AGENDADA',
} as unknown as Viagem;

const fase = (f: 'SAIDA' | 'CHEGADA', extra: Partial<EvidenciaOdometro> = {}): EvidenciaOdometro => ({
  id: null, fase: f, situacao: 'PENDENTE', km: null, registrada_em: null, autor_nome: null,
  compartilhada: false, excecao: null, pode_baixar: false, ...extra,
});
const situacao = (saida: Partial<EvidenciaOdometro> = {}, chegada: Partial<EvidenciaOdometro> = {}): EvidenciasDaViagem => ({
  tipo_operacao: 'ADMINISTRATIVA', viagem_id: 7, veiculo_placa: 'ABC1D23', motorista_nome: 'Beto',
  fotos_disponiveis: true, fotos_obrigatorias: true,
  saida: fase('SAIDA', saida), chegada: fase('CHEGADA', chegada),
});

const fotoJpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], 'odo.jpg', { type: 'image/jpeg' });

function abrir(onSalvar = vi.fn().mockResolvedValue(undefined), referencia = viagem) {
  const onClose = vi.fn();
  render(<ModalIniciarViagem viagem={referencia} onClose={onClose} onSalvar={onSalvar} />);
  return { onSalvar, onClose };
}

/** Escolhe a foto e espera a validação (assíncrona) terminar. */
async function escolherFoto(arquivo = fotoJpeg(), fase = 'SAIDA', valida = true) {
  fireEvent.change(screen.getByTestId(`foto-galeria-${fase}`), { target: { files: [arquivo] } });
  if (valida) await screen.findByAltText(/Prévia da foto do odômetro/);
}

const informarKm = (valor: string) =>
  fireEvent.change(screen.getByLabelText(/Odômetro de Saída/), { target: { value: valor } });
const confirmar = () => fireEvent.click(screen.getByRole('button', { name: /Confirmar Saída/ }));
const tentarNovamente = () => fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:previa');
  URL.revokeObjectURL = vi.fn();
  api.consultar.mockResolvedValue(situacao());
  api.enviar.mockResolvedValue({ id: 'ev-1', fase: 'SAIDA', expira_em: '2026-11-18T12:00:00Z' });
});

afterEach(() => {
  RECURSOS_BACKEND.fotosOdometro = false;
  vi.unstubAllGlobals();
});

describe('ModalIniciarViagem sem o back das fotos (interruptor desligado)', () => {
  it('não pede foto, não chama a API de evidências e envia só o km', async () => {
    const { onSalvar, onClose } = abrir();
    expect(screen.queryByText(/Tirar foto agora/)).not.toBeInTheDocument();

    informarKm('35000');
    confirmar();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSalvar).toHaveBeenCalledWith(35000);
    expect(onSalvar.mock.calls[0]).toHaveLength(1);
    expect(api.consultar).not.toHaveBeenCalled();
    expect(api.enviar).not.toHaveBeenCalled();
  });
});

describe('ModalIniciarViagem com foto do odômetro (SCRUM-205/214)', () => {
  beforeEach(() => {
    RECURSOS_BACKEND.fotosOdometro = true;
  });

  it('oferece câmera e galeria separadas e exige a foto', async () => {
    const { onSalvar } = abrir();
    expect(await screen.findByRole('button', { name: /Tirar foto agora/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Carregar foto/ })).toBeInTheDocument();
    expect(screen.getByTestId('foto-camera-SAIDA')).toHaveAttribute('capture', 'environment');
    expect(screen.getByTestId('foto-galeria-SAIDA')).not.toHaveAttribute('capture');

    informarKm('35000');
    confirmar();
    expect(await screen.findByText('Tire ou carregue a foto do odômetro na saída.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('envia a foto e depois inicia com o id da evidência', async () => {
    const { onSalvar, onClose } = abrir();
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    expect(await screen.findByAltText('Prévia da foto do odômetro na saída')).toBeInTheDocument();

    informarKm('35000');
    confirmar();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.enviar).toHaveBeenCalledWith(viagem, 'SAIDA', expect.any(File), expect.objectContaining({
      chaveIdempotencia: expect.any(String),
    }));
    expect(onSalvar).toHaveBeenCalledWith(35000, 'ev-1');
  });

  it('orienta a corrigir o odômetro fora do intervalo antes de enviar a foto', async () => {
    const { onSalvar } = abrir();
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    informarKm('7454757527');
    confirmar();

    expect(screen.getByText('A quilometragem deve ser de no máximo 2.147.483.647 km.')).toBeVisible();
    expect(screen.getByAltText(/Prévia da foto do odômetro/)).toBeVisible();
    expect(api.enviar).not.toHaveBeenCalled();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('recusa arquivo que não é imagem e não o seleciona', async () => {
    abrir();
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto(new File(['%PDF-1.7 abcdef'], 'odo.jpg', { type: 'image/jpeg' }), 'SAIDA', false);

    expect(await screen.findByText(/não é uma imagem válida/)).toBeInTheDocument();
    expect(screen.queryByAltText(/Prévia/)).not.toBeInTheDocument();
  });

  it('permite repetir a captura e bloqueia a confirmação enquanto valida a substituição', async () => {
    const { onSalvar } = abrir();
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    informarKm('35000');

    const substituta = new File([fotoJpeg()], 'substituta.jpg', { type: 'image/jpeg' });
    const camera = screen.getByTestId('foto-camera-SAIDA');
    const abrirCamera = vi.spyOn(camera, 'click');
    const botaoCamera = screen.getByRole('button', { name: 'Tirar outra foto' });
    botaoCamera.focus();
    fireEvent.click(botaoCamera);
    expect(abrirCamera).toHaveBeenCalledTimes(1);
    fireEvent.change(camera, { target: { files: [substituta] } });

    expect(screen.getByText('Verificando a foto...')).toBeVisible();
    expect(botaoCamera).toHaveFocus();
    expect(botaoCamera).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(botaoCamera);
    expect(abrirCamera).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Confirmar Saída/ })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText(/Odômetro de Saída/).closest('form')!);
    expect(api.enviar).not.toHaveBeenCalled();

    await screen.findByText('Foto selecionada: substituta.jpg');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa');
    confirmar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(api.enviar).toHaveBeenCalledWith(viagem, 'SAIDA', substituta, expect.anything());
  });

  it('mantém o km e revoga a prévia ao remover a foto', async () => {
    const { onSalvar } = abrir();
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    informarKm('35000');
    fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }));

    expect(screen.getByRole('button', { name: 'Carregar foto' })).toHaveFocus();
    expect(screen.getByText('Foto removida.')).toHaveAttribute('role', 'status');
    expect(screen.queryByAltText(/Prévia/)).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa');
    expect(screen.getByLabelText(/Odômetro de Saída/)).toHaveValue(35000);
    confirmar();
    expect(screen.getByText(/Tire ou carregue a foto/)).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('ajusta o diálogo quando o teclado reduz a área visual', () => {
    const viewport = Object.assign(new EventTarget(), { height: 640, width: 390, offsetTop: 0, offsetLeft: 0 });
    vi.stubGlobal('visualViewport', viewport);
    abrir();
    const fundo = screen.getByRole('dialog').parentElement;
    expect(fundo).toHaveStyle({ height: '640px', top: '0px' });

    Object.assign(viewport, { height: 290, width: 320, offsetTop: 80, offsetLeft: 32 });
    viewport.dispatchEvent(new Event('resize'));
    expect(fundo).toHaveStyle({ height: '290px', width: '320px', top: '80px', left: '32px' });
  });

  it('falha na transição: mantém km e foto e não reenvia a mesma foto', async () => {
    const onSalvar = vi.fn()
      .mockRejectedValueOnce(new ApiError('O km inicial é menor que o km atual do veículo', 400))
      .mockResolvedValueOnce(undefined);
    const { onClose } = abrir(onSalvar);
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    informarKm('35000');
    confirmar();

    expect(await screen.findByText(/menor que o km atual/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Odômetro de Saída/)).toHaveValue(35000);
    expect(screen.getByAltText(/Prévia/)).toBeInTheDocument();

    tentarNovamente();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.enviar).toHaveBeenCalledTimes(1);
    expect(onSalvar).toHaveBeenNthCalledWith(2, 35000, 'ev-1');
  });

  it('evidência recusada pelo servidor: a próxima tentativa envia a foto de novo com outra chave', async () => {
    api.enviar
      .mockResolvedValueOnce({ id: 'ev-1', fase: 'SAIDA', expira_em: '' })
      .mockResolvedValueOnce({ id: 'ev-2', fase: 'SAIDA', expira_em: '' });
    const onSalvar = vi.fn()
      .mockRejectedValueOnce(new ApiError('A foto enviada expirou. Envie novamente.', 422, [], 'EVIDENCIA_EXPIRADA'))
      .mockResolvedValueOnce(undefined);
    abrir(onSalvar);
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    informarKm('35000');
    confirmar();
    expect(await screen.findByText(/expirou/)).toBeInTheDocument();

    tentarNovamente();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(2));
    expect(api.enviar).toHaveBeenCalledTimes(2);
    const [, , , primeira] = api.enviar.mock.calls[0];
    const [, , , segunda] = api.enviar.mock.calls[1];
    expect(segunda.chaveIdempotencia).not.toBe(primeira.chaveIdempotencia);
    expect(onSalvar).toHaveBeenLastCalledWith(35000, 'ev-2');
  });

  it('sem conexão no envio da foto: mantém os dados e permite reenviar com a mesma chave', async () => {
    api.enviar.mockRejectedValueOnce(new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0));
    const { onSalvar } = abrir();
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    informarKm('35000');
    screen.getByRole('button', { name: /Confirmar Saída/ }).focus();
    confirmar();

    expect(await screen.findByText(/A saída não foi confirmada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveFocus();
    expect(onSalvar).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Odômetro de Saída/)).toHaveValue(35000);
    expect(screen.getByAltText(/Prévia/)).toBeInTheDocument();
    tentarNovamente();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(35000, 'ev-1'));
    expect(api.enviar.mock.calls[1][3].chaveIdempotencia).toBe(api.enviar.mock.calls[0][3].chaveIdempotencia);
  });

  it('impede envio duplicado com clique repetido', async () => {
    let concluir!: () => void;
    const onSalvar = vi.fn(() => new Promise<void>((r) => { concluir = r; }));
    const { onClose } = abrir(onSalvar);
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto();
    informarKm('35000');
    confirmar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeDisabled();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByLabelText(/Odômetro de Saída/).closest('form')!);
    concluir();
    await waitFor(() => expect(api.enviar).toHaveBeenCalledTimes(1));
    expect(onSalvar).toHaveBeenCalledTimes(1);
  });

  it('deslocamento SVO compartilhado: a foto já registrada não é pedida de novo', async () => {
    api.consultar.mockResolvedValue({
      ...situacao({ situacao: 'REGISTRADA', id: 'ev-9', compartilhada: true }),
      tipo_operacao: 'SVO',
    });
    const coleta: Viagem = { ...viagem, tipo_operacao: 'SVO' };
    const { onSalvar, onClose } = abrir(undefined, coleta);

    expect(await screen.findByText(/já foi registrada em outra coleta do mesmo veículo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tirar foto agora/ })).not.toBeInTheDocument();
    informarKm('35000');
    confirmar();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSalvar).toHaveBeenCalledWith(35000);
    expect(api.consultar).toHaveBeenCalledWith({ id: coleta.id, tipo_operacao: 'SVO' });
    expect(api.enviar).not.toHaveBeenCalled();
  });

  it('exceção autorizada pelo gestor: mostra quem autorizou e a justificativa', async () => {
    api.consultar.mockResolvedValue(situacao({
      situacao: 'EXCECAO_AUTORIZADA',
      excecao: { justificativa: 'Câmera do celular quebrada', autorizada_por_nome: 'Gestora Ana', autorizada_em: '2026-11-18T10:00:00Z' },
    }));
    const { onSalvar } = abrir();
    expect(await screen.findByText(/autorizada sem foto por Gestora Ana/)).toHaveTextContent('Câmera do celular quebrada');
    informarKm('35000');
    confirmar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(35000));
  });

  it('solicita autorização, atualiza a decisão e envia só o km quando aprovada', async () => {
    const pedido = {
      id: 18, fase: 'SAIDA', tipo_operacao: 'ADMINISTRATIVA', viagem_id: 7,
      motivo: 'A câmera do celular quebrou.', status: 'PENDENTE',
      justificativa: null, decidida_em: null, solicitada_em: '2026-11-18T12:00:00Z',
    } as const;
    api.consultar.mockResolvedValue({ ...situacao(), pode_solicitar_excecao: true });
    api.solicitarExcecao.mockResolvedValue(pedido);
    const { onSalvar } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar autorização sem foto' }));
    expect(screen.getByRole('button', { name: 'Enviar pedido' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo para solicitar autorização sem foto'), { target: { value: pedido.motivo } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText('Pedido aguardando decisão do gestor.')).toBeInTheDocument();
    expect(api.solicitarExcecao).toHaveBeenCalledWith(viagem, 'SAIDA', pedido.motivo);
    expect(onSalvar).not.toHaveBeenCalled();

    api.consultar.mockResolvedValue({ ...situacao(), pedidos_excecao: [{ ...pedido, status: 'APROVADA', justificativa: 'Equipamento indisponível.' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar pedido' }));
    expect(await screen.findByText(/Autorização aprovada/)).toBeInTheDocument();
    informarKm('35000');
    confirmar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(35000));
    expect(api.enviar).not.toHaveBeenCalled();
  });

  it('respeita a configuração do backend quando a foto está indisponível', async () => {
    api.consultar.mockResolvedValue({ ...situacao(), fotos_disponiveis: false, fotos_obrigatorias: false });
    const { onSalvar } = abrir();
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar Saída/ })).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Carregar foto/ })).not.toBeInTheDocument();
    informarKm('35000');
    confirmar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(35000));
  });

  it('se a consulta falhar, delega a validação da obrigatoriedade ao servidor', async () => {
    api.consultar.mockRejectedValue(new ApiError('Servidor indisponível', 503));
    const { onSalvar } = abrir();
    expect(await screen.findByText(/O servidor validará a transição/)).toBeInTheDocument();
    informarKm('35000');
    confirmar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(35000));
  });
});

describe('ModalFinalizarViagem com foto do odômetro (SCRUM-206)', () => {
  beforeEach(() => {
    RECURSOS_BACKEND.fotosOdometro = true;
    api.enviar.mockResolvedValue({ id: 'ev-c', fase: 'CHEGADA', expira_em: '' });
  });

  it('rejeita km final acima do limite antes de calcular a distância ou enviar a foto', async () => {
    const onSalvar = vi.fn();
    render(<ModalFinalizarViagem viagem={viagem} onClose={vi.fn()} onSalvar={onSalvar} />);
    await screen.findByRole('button', { name: /Carregar foto/ });
    await escolherFoto(fotoJpeg(), 'CHEGADA');
    fireEvent.change(screen.getByLabelText(/Odômetro Final/), { target: { value: '2147483648' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Chegada/ }));

    expect(screen.getByText('A quilometragem deve ser de no máximo 2.147.483.647 km.')).toBeVisible();
    expect(screen.queryByText(/Distância percorrida apurada/)).not.toBeInTheDocument();
    expect(api.enviar).not.toHaveBeenCalled();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('mantém a regra do km e envia a foto da chegada', async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ModalFinalizarViagem viagem={viagem} onClose={onClose} onSalvar={onSalvar} />);
    await screen.findByRole('button', { name: /Carregar foto/ });

    fireEvent.change(screen.getByLabelText(/Odômetro Final/), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Chegada/ }));
    expect(await screen.findByText(/não pode ser menor que o odômetro inicial/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Odômetro Final/), { target: { value: '1120' } });
    expect(screen.getByText(/Distância percorrida apurada/)).toHaveTextContent('120 km');
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Chegada/ }));
    expect(await screen.findByText('Tire ou carregue a foto do odômetro na chegada.')).toBeInTheDocument();

    await escolherFoto(fotoJpeg(), 'CHEGADA');
    expect(screen.getByAltText('Prévia da foto do odômetro na chegada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Chegada/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.enviar).toHaveBeenCalledWith(viagem, 'CHEGADA', expect.any(File), expect.anything());
    expect(onSalvar).toHaveBeenCalledWith(1120, 'ev-c');
  });

  it('sem o interruptor, finaliza como antes', async () => {
    RECURSOS_BACKEND.fotosOdometro = false;
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(<ModalFinalizarViagem viagem={viagem} onClose={vi.fn()} onSalvar={onSalvar} />);
    fireEvent.change(screen.getByLabelText(/Odômetro Final/), { target: { value: '1120' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Chegada/ }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(1120));
    expect(screen.queryByText(/Tirar foto agora/)).not.toBeInTheDocument();
  });
});
