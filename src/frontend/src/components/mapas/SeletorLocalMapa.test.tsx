import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeletorLocalMapa, type SeletorLocalMapaProps } from './SeletorLocalMapa';
import { mapasApi } from '../../services/api/mapasApi';
import { ApiError } from '../../services/api/http';
import type {
  CoordenadaMapa,
  EnderecoMapa,
  LocalSelecionado,
  RespostaBuscaMapa,
} from '../../types/mapa';
import * as suporteWebgl from '../../utils/suporteWebgl';

vi.mock('../../services/api/mapasApi', () => ({
  mapasApi: {
    buscar: vi.fn(),
    reverso: vi.fn(),
    calcularRota: vi.fn(),
  },
}));

const ENDERECO_ARACAJU: EnderecoMapa = {
  fonte: 'photon',
  logradouro: 'Av. Augusto Franco',
  numero: '1200',
  bairro: 'Siqueira Campos',
  municipio: 'Aracaju',
  estado: 'SE',
  cep: '49075100',
  coordenadas: { latitude: -10.9167, longitude: -37.0772 },
  foraDeSergipe: false,
};

const ENDERECO_FORA_SE: EnderecoMapa = {
  fonte: 'photon',
  logradouro: 'Av. Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  municipio: 'São Paulo',
  estado: 'SP',
  cep: '01310100',
  coordenadas: { latitude: -23.5614, longitude: -46.6559 },
  foraDeSergipe: true,
};

function Harness(
  props: Partial<SeletorLocalMapaProps> & {
    valorInicial?: string;
    coordenadasIniciais?: CoordenadaMapa | null;
    onChangeSpy?: (valor: string, coords: CoordenadaMapa | null) => void;
    onSelecaoSpy?: (local: LocalSelecionado) => void;
  },
) {
  const {
    valorInicial = '',
    coordenadasIniciais = null,
    onChangeSpy,
    onSelecaoSpy,
    ...rest
  } = props;
  const [valor, setValor] = useState(valorInicial);
  const [coordenadas, setCoordenadas] = useState<CoordenadaMapa | null>(coordenadasIniciais);

  return (
    <SeletorLocalMapa
      valor={valor}
      coordenadas={coordenadas}
      onChange={(novoValor, novasCoords) => {
        setValor(novoValor);
        setCoordenadas(novasCoords);
        onChangeSpy?.(novoValor, novasCoords);
      }}
      onSelecaoConfirmada={(local) => onSelecaoSpy?.(local)}
      {...rest}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SeletorLocalMapa', () => {
  it('inicia recolhido no modo expansivel e abre o mapa sob demanda', async () => {
    render(<Harness exibicaoMapa="expansivel" />);

    expect(screen.queryByTestId('mock-maplibre')).not.toBeInTheDocument();
    const botao = screen.getByRole('button', { name: /Abrir mapa/i });
    expect(botao).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(botao);

    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ocultar mapa/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('renderiza o mapa imediatamente no modo aberto', async () => {
    render(<Harness exibicaoMapa="aberto" />);
    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir mapa/i })).not.toBeInTheDocument();
  });

  it('busca endereço com debounce e permite seleção por teclado', async () => {
    vi.useFakeTimers();
    vi.mocked(mapasApi.buscar).mockResolvedValueOnce({
      resultados: [ENDERECO_ARACAJU],
      degradado: false,
    });
    const onSelecaoSpy = vi.fn();

    render(<Harness operacao="SVO" onSelecaoSpy={onSelecaoSpy} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'Av. Augusto Franco' } });
    expect(mapasApi.buscar).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(410);
    });

    expect(mapasApi.buscar).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Av. Augusto Franco', operacao: 'SVO', modoPublico: false }),
    );
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelecaoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: 'busca',
        coordenadas: { latitude: -10.9167, longitude: -37.0772 },
        foraDeSergipe: false,
      }),
    );
    expect(screen.getByTestId('seletor-local-badge-coordenadas')).toBeInTheDocument();
  });

  it('detecta CEP automaticamente e preserva endereço ViaCEP quando degradado sem coordenadas', async () => {
    vi.useFakeTimers();
    const viaCepDegradado: EnderecoMapa = {
      fonte: 'viaCEP',
      logradouro: 'Rua Laranjeiras',
      numero: null,
      bairro: 'Centro',
      municipio: 'Aracaju',
      estado: 'SE',
      cep: '49010000',
      coordenadas: null,
      foraDeSergipe: false,
    };
    vi.mocked(mapasApi.buscar).mockResolvedValueOnce({
      resultados: [viaCepDegradado],
      degradado: true,
    });
    const onSelecaoSpy = vi.fn();

    render(<Harness onSelecaoSpy={onSelecaoSpy} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: '49010-000' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(410);
    });

    expect(mapasApi.buscar).toHaveBeenCalledWith(
      expect.objectContaining({ cep: '49010000', operacao: 'ADM' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /Endereço encontrado pelo CEP sem coordenadas automáticas/i,
    );

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelecaoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: 'cep',
        coordenadas: null,
        endereco: expect.stringContaining('Rua Laranjeiras'),
      }),
    );
  });

  it('no modoPublico oculta atalhos por padrão, só consulta CEP e degrada em 404 RECURSO_DESATIVADO', async () => {
    vi.useFakeTimers();
    vi.mocked(mapasApi.buscar).mockRejectedValueOnce(
      new ApiError('Rota não encontrada', 404, [], 'RECURSO_DESATIVADO'),
    );

    render(<Harness modoPublico exibicaoMapa="aberto" />);
    expect(screen.queryByRole('button', { name: 'HEMOSE' })).not.toBeInTheDocument();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Rua das Flores, Aracaju' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(mapasApi.buscar).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '49015-110' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(410);
    });

    expect(mapasApi.buscar).toHaveBeenCalledWith(
      expect.objectContaining({ cep: '49015110', modoPublico: true }),
    );
    expect(screen.getByText(/preencher o endereço manualmente/i)).toBeInTheDocument();
  });

  it('suporta atalho de unidade institucional com coordenadas e fallback manual quando vazio', async () => {
    vi.mocked(mapasApi.buscar)
      .mockResolvedValueOnce({
        resultados: [
          {
            ...ENDERECO_ARACAJU,
            fonte: 'unidade',
            logradouro: 'Av. Prof. José Bonifácio Fortes Neto',
          },
        ],
        degradado: false,
      })
      .mockResolvedValueOnce({ resultados: [], degradado: false });

    const onSelecaoSpy = vi.fn();
    render(<Harness onSelecaoSpy={onSelecaoSpy} />);

    fireEvent.click(screen.getByRole('button', { name: 'HEMOSE' }));
    await waitFor(() => {
      expect(onSelecaoSpy).toHaveBeenCalledWith(expect.objectContaining({ origem: 'unidade' }));
    });

    fireEvent.click(screen.getByRole('button', { name: 'LACEN' }));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue(
        'LACEN — Laboratório Central de Saúde Pública',
      );
    });
    expect(
      screen.getByText(/Coordenadas oficiais de LACEN ainda não cadastradas/i),
    ).toBeInTheDocument();
  });

  it('dispara geocodificação reversa ao clicar no mapa e no dragend do pin, e permite limpar coordenadas', async () => {
    vi.mocked(mapasApi.reverso)
      .mockResolvedValueOnce({ resultados: [ENDERECO_ARACAJU], degradado: false })
      .mockResolvedValueOnce({
        resultados: [{ ...ENDERECO_ARACAJU, logradouro: 'Rua Ajustada pelo Pin' }],
        degradado: false,
      });
    const onSelecaoSpy = vi.fn();
    const onChangeSpy = vi.fn();

    render(<Harness exibicaoMapa="aberto" onSelecaoSpy={onSelecaoSpy} onChangeSpy={onChangeSpy} />);

    await screen.findByTestId('mock-maplibre');
    fireEvent.click(screen.getByRole('button', { name: 'Clicar no mapa' }));

    await waitFor(() => {
      expect(mapasApi.reverso).toHaveBeenCalledWith(
        expect.objectContaining({ lat: -10.925, lon: -37.065 }),
      );
    });
    expect(onSelecaoSpy).toHaveBeenCalledWith(expect.objectContaining({ origem: 'mapa' }));

    const botaoDragEnd = await screen.findByTestId('mock-maplibre-marker-dragend');
    fireEvent.click(botaoDragEnd);

    await waitFor(() => {
      expect(mapasApi.reverso).toHaveBeenCalledWith(
        expect.objectContaining({ lat: -10.931, lon: -37.051 }),
      );
    });
    expect(screen.getByRole('combobox')).toHaveValue(
      'Rua Ajustada pelo Pin, 1200, Siqueira Campos, Aracaju - SE, CEP 49075-100',
    );

    fireEvent.click(screen.getByRole('button', { name: /Limpar ponto no mapa/i }));
    expect(onChangeSpy).toHaveBeenLastCalledWith(
      'Rua Ajustada pelo Pin, 1200, Siqueira Campos, Aracaju - SE, CEP 49075-100',
      null,
    );
  });

  it('trata GPS permitido com reverso e GPS negado com aviso sem bloquear', async () => {
    vi.mocked(mapasApi.reverso).mockResolvedValueOnce({
      resultados: [ENDERECO_ARACAJU],
      degradado: false,
    });
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((sucesso: PositionCallback) => {
        sucesso({
          coords: { latitude: -10.9167, longitude: -37.0772 },
        } as GeolocationPosition);
      })
      .mockImplementationOnce((_sucesso: PositionCallback, falha: PositionErrorCallback) => {
        falha({ code: 1, message: 'User denied' } as GeolocationPositionError);
      });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const onSelecaoSpy = vi.fn();
    render(<Harness onSelecaoSpy={onSelecaoSpy} />);

    fireEvent.click(screen.getByRole('button', { name: /Usar minha localização/i }));
    await waitFor(() => {
      expect(onSelecaoSpy).toHaveBeenCalledWith(expect.objectContaining({ origem: 'gps' }));
    });

    fireEvent.click(screen.getByRole('button', { name: /Usar minha localização/i }));
    expect(await screen.findByText(/Permissão de localização negada/i)).toBeInTheDocument();
  });

  it('descarta respostas obsoletas fora de ordem e invalida coordenadas ao editar manualmente', async () => {
    vi.useFakeTimers();
    let resolverPrimeira!: (valor: RespostaBuscaMapa) => void;
    let resolverSegunda!: (valor: RespostaBuscaMapa) => void;

    vi.mocked(mapasApi.buscar)
      .mockImplementationOnce(
        () =>
          new Promise<RespostaBuscaMapa>((resolve) => {
            resolverPrimeira = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<RespostaBuscaMapa>((resolve) => {
            resolverSegunda = resolve;
          }),
      );

    const onChangeSpy = vi.fn();
    render(
      <Harness
        valorInicial="Ponto Antigo"
        coordenadasIniciais={{ latitude: -10.91, longitude: -37.07 }}
        onChangeSpy={onChangeSpy}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Rua Primeira' } });
    // Edição manual invalida imediatamente as coordenadas antigas
    expect(onChangeSpy).toHaveBeenLastCalledWith('Rua Primeira', null);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(410);
    });

    fireEvent.change(input, { target: { value: 'Rua Segunda' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(410);
    });

    // Resolve a segunda antes e a primeira (obsoleta) depois
    await act(async () => {
      resolverSegunda({
        resultados: [{ ...ENDERECO_ARACAJU, logradouro: 'Rua Segunda Confirmada' }],
        degradado: false,
      });
    });
    await act(async () => {
      resolverPrimeira({
        resultados: [{ ...ENDERECO_ARACAJU, logradouro: 'Rua Primeira Obsoleta' }],
        degradado: false,
      });
    });

    expect(screen.getByText(/Rua Segunda Confirmada/i)).toBeInTheDocument();
    expect(screen.queryByText(/Rua Primeira Obsoleta/i)).not.toBeInTheDocument();
  });

  it('exibe aviso com confirmação consciente para endereço fora de Sergipe e fallback em 429', async () => {
    vi.useFakeTimers();
    vi.mocked(mapasApi.buscar)
      .mockResolvedValueOnce({ resultados: [ENDERECO_FORA_SE], degradado: false })
      .mockRejectedValueOnce(new ApiError('Muitas requisições', 429));

    render(<Harness />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'Av. Paulista' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(410);
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent(/fora de Sergipe/i);
    const checkbox = screen.getByRole('checkbox', {
      name: /Confirmo que o local realmente fica fora de Sergipe/i,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.change(input, { target: { value: 'Outra Rua' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(410);
    });
    expect(screen.getByText(/Muitas consultas em sequência/i)).toBeInTheDocument();
  });
});
