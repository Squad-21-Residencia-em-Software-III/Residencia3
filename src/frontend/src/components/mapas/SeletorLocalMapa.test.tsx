import * as recursos from '../../config/recursosBackend';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  vi.spyOn(recursos, 'recursoAtivo').mockReturnValue(true);
  vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SeletorLocalMapa', () => {
  it.each([['-10', ''], ['91', '-37'], ['-10', '-181'], ['Infinity', '0'], ['1e1', '0']])(
    'não consulta com latitude %s e longitude %s inválidas', (latitude, longitude) => {
      render(<Harness />);
      const campoLatitude = screen.getByRole('textbox', { name: 'Latitude' });
      fireEvent.change(campoLatitude, { target: { value: latitude } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Longitude' }), { target: { value: longitude } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar coordenadas' }));
      expect(screen.getByRole('alert')).toHaveTextContent('latitude entre');
      expect(campoLatitude).toHaveAccessibleDescription(/longitude entre/);
      expect(mapasApi.reverso).not.toHaveBeenCalled();
    },
  );

  it('confirma coordenadas decimais só por teclado e permite limpar com o mapa recolhido', async () => {
    const teclado = userEvent.setup();
    const onSelecaoSpy = vi.fn();
    vi.mocked(mapasApi.reverso).mockResolvedValueOnce({ resultados: [ENDERECO_ARACAJU], degradado: false });
    render(<Harness modoPublico onSelecaoSpy={onSelecaoSpy} />);
    await teclado.tab(); // endereço
    await teclado.tab(); // GPS
    await teclado.tab(); // abrir mapa
    await teclado.tab();
    expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveFocus();
    await teclado.keyboard('-10,91');
    await teclado.tab();
    expect(screen.getByRole('textbox', { name: 'Longitude' })).toHaveFocus();
    await teclado.keyboard('-37,07');
    expect(mapasApi.reverso).not.toHaveBeenCalled();
    await teclado.tab();
    await teclado.keyboard('{Enter}');
    expect(mapasApi.reverso).toHaveBeenCalledWith(expect.objectContaining({ lat: -10.91, lon: -37.07, modoPublico: true }));
    await waitFor(() => expect(onSelecaoSpy).toHaveBeenCalledWith(expect.objectContaining({
      origem: 'manual', coordenadas: { latitude: -10.91, longitude: -37.07 }, foraDeSergipe: false,
    })));
    const endereco = screen.getByRole('combobox');
    expect(endereco).toHaveProperty('value', expect.stringContaining('Augusto Franco'));
    await teclado.tab();
    expect(screen.getByRole('button', { name: 'Limpar ponto no mapa' })).toHaveFocus();
    await teclado.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Confirmar coordenadas' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Longitude' })).toHaveValue('');
    expect(screen.queryByText('Ponto definido')).not.toBeInTheDocument();
    expect(endereco).toHaveProperty('value', expect.stringContaining('Augusto Franco'));
  });

  it('cancela busca de CEP com ajuste manual e descarta o reverso antigo após edição do endereço', async () => {
    vi.useFakeTimers();
    let resolverCep!: (resposta: RespostaBuscaMapa) => void;
    let resolverReverso!: (resposta: RespostaBuscaMapa) => void;
    vi.mocked(mapasApi.buscar).mockReturnValueOnce(new Promise((resolver) => { resolverCep = resolver; }));
    vi.mocked(mapasApi.reverso).mockReturnValueOnce(new Promise((resolver) => { resolverReverso = resolver; }));
    const confirmar = vi.fn();
    render(<Harness onSelecaoSpy={confirmar} modoPublico />);
    const endereco = screen.getByRole('combobox');
    fireEvent.change(endereco, { target: { value: '49075100' } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    fireEvent.change(screen.getByRole('textbox', { name: 'Latitude' }), { target: { value: '90' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Longitude' }), { target: { value: '-180' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar coordenadas' }));
    expect(vi.mocked(mapasApi.buscar).mock.lastCall?.[0].signal?.aborted).toBe(true);
    expect(mapasApi.reverso).toHaveBeenCalledWith(expect.objectContaining({ lat: 90, lon: -180 }));
    await act(() => resolverCep({ resultados: [ENDERECO_ARACAJU], degradado: false }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.change(endereco, { target: { value: 'Endereço informado por teclado' } });
    expect(vi.mocked(mapasApi.reverso).mock.lastCall?.[0].signal?.aborted).toBe(true);
    await act(() => resolverReverso({ resultados: [ENDERECO_FORA_SE], degradado: false }));
    expect(endereco).toHaveValue('Endereço informado por teclado');
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('preserva o endereço confirmado e o rascunho quando um reverso cancelado ainda responde', async () => {
    let responder!: (resposta: RespostaBuscaMapa) => void;
    vi.mocked(mapasApi.reverso).mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));
    const confirmar = vi.fn();
    const onChange = vi.fn();
    render(<Harness valorInicial="Endereço confirmado" coordenadasIniciais={ENDERECO_ARACAJU.coordenadas}
      onChangeSpy={onChange} onSelecaoSpy={confirmar} />);

    const latitude = screen.getByRole('textbox', { name: 'Latitude' });
    const longitude = screen.getByRole('textbox', { name: 'Longitude' });
    const botao = screen.getByRole('button', { name: 'Confirmar coordenadas' });
    fireEvent.change(latitude, { target: { value: '-23.56' } });
    fireEvent.click(botao);
    fireEvent.change(longitude, { target: { value: '-37,08' } });

    expect(vi.mocked(mapasApi.reverso).mock.lastCall?.[0].signal?.aborted).toBe(true);
    await act(() => responder({ resultados: [ENDERECO_FORA_SE], degradado: false }));
    expect(onChange).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('Endereço confirmado');
    expect(latitude).toHaveValue('-23.56');
    expect(longitude).toHaveValue('-37,08');
    expect(screen.queryByRole('checkbox', { name: /fora de Sergipe/ })).not.toBeInTheDocument();

    vi.mocked(mapasApi.reverso).mockResolvedValueOnce({ resultados: [ENDERECO_ARACAJU], degradado: false });
    fireEvent.click(botao);
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({
      coordenadas: { latitude: -23.56, longitude: -37.08 },
    })));
  });

  it('mantém as sugestões fechadas depois do Tab e permite reabri-las pela seta', async () => {
    vi.useFakeTimers();
    let responder!: (resposta: RespostaBuscaMapa) => void;
    vi.mocked(mapasApi.buscar).mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));
    render(<Harness />);
    const endereco = screen.getByRole('combobox');
    act(() => endereco.focus());
    fireEvent.change(endereco, { target: { value: 'Avenida Augusto Franco' } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    act(() => endereco.blur());
    await act(() => responder({ resultados: [ENDERECO_ARACAJU], degradado: false }));
    expect(endereco).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    act(() => endereco.focus());
    fireEvent.keyDown(endereco, { key: 'ArrowDown' });
    expect(endereco).toHaveAttribute('aria-activedescendant', screen.getByRole('option').id);
    fireEvent.keyDown(endereco, { key: 'Escape' });
    expect(endereco).toHaveFocus();
    expect(endereco).not.toHaveAttribute('aria-activedescendant');
  });

  it.each([[2, /não foi possível/i], [3, /tempo limite/i]])(
    'oferece preenchimento manual quando o GPS falha com código %i',
    (codigo, aviso) => {
      const anterior = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (_: PositionCallback, falhar: PositionErrorCallback) => {
          falhar({ code: codigo } as GeolocationPositionError);
        } },
      });
      try {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: /usar minha localização/i }));
        expect(screen.getByText(aviso)).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeEnabled();
        expect(mapasApi.reverso).not.toHaveBeenCalled();
      } finally {
        if (anterior) Object.defineProperty(navigator, 'geolocation', anterior);
        else Reflect.deleteProperty(navigator, 'geolocation');
      }
    },
  );

  it('substitui o endereço antigo quando o reverso falha e oferece a confirmação territorial', async () => {
    vi.mocked(mapasApi.reverso).mockRejectedValueOnce(new ApiError('Offline', 0));
    const confirmar = vi.fn();
    render(<Harness valorInicial="Endereço antigo" onSelecaoSpy={confirmar} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Latitude' }), { target: { value: '-23.5614' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Longitude' }), { target: { value: '-46.6559' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar coordenadas' }));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('-23.5614, -46.6559'));
    const territorial = screen.getByRole('checkbox', { name: /fora de Sergipe/ });
    fireEvent.click(territorial);
    expect(territorial).toBeChecked();
    expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ foraDeSergipe: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar ponto no mapa' }));
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(territorial).not.toBeInTheDocument();
  });

  it('cancela imediatamente a busca iniciada quando o texto muda durante o debounce', async () => {
    vi.useFakeTimers();
    let resolver!: (resposta: RespostaBuscaMapa) => void;
    const antiga = new Promise<RespostaBuscaMapa>((resolve) => { resolver = resolve; });
    vi.mocked(mapasApi.buscar).mockReturnValueOnce(antiga);
    render(<Harness />);
    const entrada = screen.getByRole('combobox');
    fireEvent.change(entrada, { target: { value: 'Avenida Augusto Franco' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const sinal = vi.mocked(mapasApi.buscar).mock.calls[0]?.[0].signal;
    fireEvent.change(entrada, { target: { value: 'Avenida Beira Mar' } });
    expect(sinal?.aborted).toBe(true);
    await act(async () => { resolver({ resultados: [ENDERECO_ARACAJU], degradado: false }); });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('ignora um GPS pendente depois de alteração externa ou desabilitação', async () => {
    let gps!: PositionCallback;
    const anterior = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (callback: PositionCallback) => { gps = callback; } },
    });
    try {
      const onChange = vi.fn();
      const { rerender } = render(<SeletorLocalMapa valor="" coordenadas={null} onChange={onChange} />);
      fireEvent.click(screen.getByRole('button', { name: /usar minha localização/i }));
      rerender(<SeletorLocalMapa valor="Outro registro" coordenadas={null} onChange={onChange} desabilitado />);
      await act(async () => { gps({ coords: { latitude: 1, longitude: 1 } } as GeolocationPosition); });
      expect(mapasApi.reverso).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      if (anterior) Object.defineProperty(navigator, 'geolocation', anterior);
      else Reflect.deleteProperty(navigator, 'geolocation');
    }
  });

  it('modo público prevalece sobre a opção de exibir atalhos institucionais', () => {
    render(<Harness modoPublico exibirAtalhosUnidades />);
    expect(screen.queryByRole('button', { name: /hemose/i })).not.toBeInTheDocument();
  });

  it('mantém o preenchimento manual sem consultar mapas com a flag desligada', async () => {
    vi.useFakeTimers();
    vi.mocked(recursos.recursoAtivo).mockReturnValue(false);
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '49015110' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByRole('button', { name: /abrir mapa/i })).not.toBeInTheDocument();
    expect(mapasApi.buscar).not.toHaveBeenCalled();
  });

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
    act(() => input.focus());

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
    act(() => input.focus());

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
    act(() => input.focus());
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
    act(() => input.focus());
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
    act(() => input.focus());

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
