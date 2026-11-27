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
});
