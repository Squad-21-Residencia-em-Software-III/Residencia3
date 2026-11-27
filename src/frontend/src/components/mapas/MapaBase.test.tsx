import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ESTILO_MAPA_LIBERTY_URL,
  PIN_FSPH_URL,
  validarUrlEstiloMapa,
} from '../../config/mapas';
import * as suporteWebgl from '../../utils/suporteWebgl';
import { MapaBase } from './MapaBase';
import { LIMITE_CARREGAMENTO_MAPA_MS } from './MapaBaseCanvas';

describe('config/mapas', () => {
  it('usa o estilo Liberty do OpenFreeMap como padrão e rejeita origens não autorizadas', () => {
    expect(validarUrlEstiloMapa(undefined)).toBe(ESTILO_MAPA_LIBERTY_URL);
    expect(validarUrlEstiloMapa('')).toBe(ESTILO_MAPA_LIBERTY_URL);
    expect(validarUrlEstiloMapa('https://tiles.openfreemap.org/styles/positron')).toBe(
      'https://tiles.openfreemap.org/styles/positron',
    );
    expect(validarUrlEstiloMapa('https://malicioso.exemplo.com/styles/liberty')).toBe(
      ESTILO_MAPA_LIBERTY_URL,
    );
    expect(validarUrlEstiloMapa('javascript:alert(1)')).toBe(ESTILO_MAPA_LIBERTY_URL);
  });
});

describe('MapaBase', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza mapa com estilo Liberty, atribuições obrigatórias e pin FSPH quando WebGL está disponível', async () => {
    vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);

    render(
      <MapaBase
        marcadorPadrao={{
          latitude: -10.9472,
          longitude: -37.0731,
          titulo: 'Pin de teste',
        }}
      />,
    );

    const mapa = await screen.findByTestId('mock-maplibre');
    expect(mapa).toHaveAttribute('data-map-style', ESTILO_MAPA_LIBERTY_URL);

    const pin = screen.getByAltText('Pin de teste');
    expect(pin).toHaveAttribute('src', PIN_FSPH_URL);

    expect(screen.getByRole('link', { name: 'OpenFreeMap' })).toHaveAttribute(
      'href',
      'https://openfreemap.org/',
    );
    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
    expect(screen.getByRole('link', { name: 'Corrigir mapa' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/fixthemap',
    );
    expect(screen.getByRole('link', { name: 'FOSSGIS/OSRM' })).toHaveAttribute(
      'href',
      'https://routing.openstreetmap.de/about.html',
    );
  });

  it('exibe fallback acessível quando WebGL não é suportado', () => {
    vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(false);

    render(<MapaBase />);

    expect(screen.getByRole('status')).toHaveTextContent('Mapa indisponível no momento');
    expect(screen.queryByTestId('mock-maplibre')).not.toBeInTheDocument();
  });

  it('reporta uma falha de inicialização uma vez', async () => {
    vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);
    const onIndisponivel = vi.fn();
    render(<StrictMode><MapaBase onIndisponivel={onIndisponivel} /></StrictMode>);
    fireEvent.click(await screen.findByRole('button', { name: 'Falhar inicialização' }));
    expect(screen.getByRole('status')).toHaveTextContent('Mapa indisponível no momento');
    expect(onIndisponivel).toHaveBeenCalledExactlyOnceWith('erro');
  });

  it.each([true, false])('aguarda tiles e mantém mapa funcional após falha isolada (carregou: %s)', async (carregou) => {
    vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);
    const onIndisponivel = vi.fn();
    const relogio = vi.spyOn(window, 'setTimeout');
    try {
      render(<MapaBase onIndisponivel={onIndisponivel} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Falhar tile' }));
      expect(onIndisponivel).not.toHaveBeenCalled();
      if (carregou) fireEvent.click(screen.getByRole('button', { name: 'Carregar mapa e tile' }));
      const prazo = relogio.mock.calls.find(([, ms]) => ms === LIMITE_CARREGAMENTO_MAPA_MS)?.[0];
      expect(typeof prazo).toBe('function');
      act(() => { if (typeof prazo === 'function') prazo(); });
      if (carregou) {
        expect(screen.getByTestId('mock-maplibre')).toBeInTheDocument();
        expect(onIndisponivel).not.toHaveBeenCalled();
      } else {
        expect(screen.getByRole('status')).toHaveTextContent('Mapa indisponível no momento');
        expect(onIndisponivel).toHaveBeenCalledExactlyOnceWith('erro');
      }
    } finally {
      relogio.mockRestore();
    }
  });

  it.each([
    { falha: 'Perder contexto WebGL', recupera: true },
    { falha: 'Perder contexto WebGL', recupera: false },
    { falha: 'Interromper todos os tiles', recupera: false },
  ])('acompanha falhas depois da renderização ($falha, recupera: $recupera)', async ({ falha, recupera }) => {
    vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);
    const onIndisponivel = vi.fn();
    render(<StrictMode><MapaBase onIndisponivel={onIndisponivel} fallback={<p>Entrada manual</p>} /></StrictMode>);
    const carregarMapa = await screen.findByRole('button', { name: 'Carregar mapa e tile' });
    fireEvent.click(carregarMapa);

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: falha }));
      expect(screen.getByTestId('mock-maplibre')).toBeInTheDocument();
      if (recupera) {
        fireEvent.click(screen.getByRole('button', { name: 'Restaurar contexto WebGL' }));
        fireEvent.click(carregarMapa);
      }
      act(() => { vi.advanceTimersByTime(LIMITE_CARREGAMENTO_MAPA_MS); });
      if (recupera) {
        expect(screen.getByTestId('mock-maplibre')).toBeInTheDocument();
        expect(onIndisponivel).not.toHaveBeenCalled();
      } else {
        expect(screen.getByText('Entrada manual')).toBeInTheDocument();
        expect(onIndisponivel).toHaveBeenCalledExactlyOnceWith('erro');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([true, false])('acompanha a troca de estilo sem desmontar o mapa (carregou: %s)', async (carregou) => {
    vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);
    const onIndisponivel = vi.fn();
    const { rerender } = render(<MapaBase onIndisponivel={onIndisponivel} />);
    const carregarMapa = await screen.findByRole('button', { name: 'Carregar mapa e tile' });
    fireEvent.click(carregarMapa);
    vi.useFakeTimers();
    vi.stubEnv('VITE_MAPA_ESTILO_URL', 'https://tiles.openfreemap.org/styles/positron');
    try {
      rerender(<MapaBase tema="escuro" onIndisponivel={onIndisponivel} />);
      expect(screen.getByTestId('mock-maplibre')).toHaveAttribute(
        'data-map-style', 'https://tiles.openfreemap.org/styles/positron',
      );
      if (carregou) fireEvent.click(carregarMapa);
      act(() => { vi.advanceTimersByTime(LIMITE_CARREGAMENTO_MAPA_MS); });
      if (carregou) {
        expect(onIndisponivel).not.toHaveBeenCalled();
      } else {
        expect(screen.getByRole('status')).toHaveTextContent('Mapa indisponível no momento');
        expect(onIndisponivel).toHaveBeenCalledExactlyOnceWith('erro');
      }
    } finally {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    }
  });

});
