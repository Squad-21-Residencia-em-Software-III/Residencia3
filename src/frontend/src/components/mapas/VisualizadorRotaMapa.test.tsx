import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualizadorRotaMapa } from './VisualizadorRotaMapa';
import type { HistoricoGeograficoMapa, PontoRotaMapa, RotaPlanejadaMapa } from '../../types/mapa';
import * as suporteWebgl from '../../utils/suporteWebgl';

function codificarValorPolyline5(valor: number): string {
  let v = valor < 0 ? ~(valor << 1) : valor << 1;
  let saida = '';
  while (v >= 0x20) {
    saida += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  saida += String.fromCharCode(v + 63);
  return saida;
}

function codificarPolyline5(pontos: { latitude: number; longitude: number }[]): string {
  let anteriorLat = 0;
  let anteriorLon = 0;
  let encoded = '';
  for (const ponto of pontos) {
    const lat = Math.round(ponto.latitude * 1e5);
    const lon = Math.round(ponto.longitude * 1e5);
    encoded += codificarValorPolyline5(lat - anteriorLat);
    encoded += codificarValorPolyline5(lon - anteriorLon);
    anteriorLat = lat;
    anteriorLon = lon;
  }
  return encoded;
}

// Fixture sintética (dados fictícios em Aracaju/SE)
const PONTOS_FIXTURE: PontoRotaMapa[] = [
  {
    id: 'orig',
    tipo: 'ORIGEM',
    rotulo: 'HEMOSE — Origem Sintética',
    endereco: 'Av. Tancredo Neves, Aracaju - SE',
    coordenadas: { latitude: -10.9472, longitude: -37.0731 },
  },
  {
    id: 'p1',
    tipo: 'PARADA',
    ordem: 1,
    rotulo: 'Parada 1 — Unidade Sintética A',
    endereco: 'Rua Capucho, 100',
    coordenadas: { latitude: -10.931, longitude: -37.065 },
  },
  {
    id: 'p2',
    tipo: 'PARADA',
    ordem: 2,
    rotulo: 'Parada 2 — Unidade Sintética B',
    endereco: 'Av. Augusto Franco, 500',
    coordenadas: { latitude: -10.922, longitude: -37.058 },
  },
  {
    id: 'dest',
    tipo: 'DESTINO',
    rotulo: 'LACEN — Destino Sintético',
    endereco: 'Av. Beira Mar, Aracaju - SE',
    coordenadas: { latitude: -10.9167, longitude: -37.0512 },
  },
];

const POLYLINE_VALIDA = codificarPolyline5([
  { latitude: -10.9472, longitude: -37.0731 },
  { latitude: -10.931, longitude: -37.065 },
  { latitude: -10.922, longitude: -37.058 },
  { latitude: -10.9167, longitude: -37.0512 },
]);

const ROTA_PLANEJADA_OSRM: RotaPlanejadaMapa = {
  geometria: POLYLINE_VALIDA,
  formatoGeometria: 'polyline5',
  distanciaMetros: 14800,
  metodo: 'OSRM',
  aproximada: false,
};

const HISTORICO_FIXTURE: HistoricoGeograficoMapa = {
  checkpoints: [
    {
      id: 'cp-1',
      rotulo: 'Saída',
      horario: '2026-11-28T08:05:00-03:00',
      coordenadas: { latitude: -10.9472, longitude: -37.0731 },
      precisaoMetros: 18,
      tipo: 'SAIDA',
    },
    {
      id: 'cp-2',
      rotulo: 'Retomada do sinal',
      horario: '2026-11-28T08:41:00-03:00',
      coordenadas: { latitude: -10.922, longitude: -37.058 },
      precisaoMetros: 220,
      tipo: 'INTERMEDIARIO',
    },
    {
      id: 'cp-3',
      rotulo: 'Chegada',
      horario: '2026-11-28T08:58:00-03:00',
      coordenadas: { latitude: -10.9167, longitude: -37.0512 },
      precisaoMetros: 12,
      tipo: 'CHEGADA',
    },
  ],
  trechos: [
    {
      id: 'obs-1',
      tipo: 'OBSERVADO',
      pontos: [
        { latitude: -10.9472, longitude: -37.0731 },
        { latitude: -10.935, longitude: -37.068 },
      ],
    },
    {
      id: 'est-1',
      tipo: 'ESTIMADO',
      pontos: [
        { latitude: -10.922, longitude: -37.058 },
        { latitude: -10.919, longitude: -37.054 },
      ],
    },
    {
      id: 'obs-2',
      tipo: 'OBSERVADO',
      pontos: [
        { latitude: -10.919, longitude: -37.054 },
        { latitude: -10.9167, longitude: -37.0512 },
      ],
    },
  ],
  lacunas: [
    {
      id: 'lac-1',
      inicioEm: '08:22',
      fimEm: '08:41',
    },
  ],
};

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchSpy);
  vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VisualizadorRotaMapa', () => {
  it('renderiza polyline5, pins FSPH numerados, legenda e não chama OSRM/fetch', async () => {
    render(
      <VisualizadorRotaMapa
        titulo="Rota planejada"
        pontos={PONTOS_FIXTURE}
        rotaPlanejada={ROTA_PLANEJADA_OSRM}
      />,
    );

    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();

    await waitFor(() => {
      const sourcePlanejada = document.querySelector('[data-source-id="rota-planejada"]');
      expect(sourcePlanejada).toBeInTheDocument();
      expect(sourcePlanejada).toHaveAttribute('data-features-count', '1');
    });

    // 4 pins FSPH oficiais (Origem, Parada 1, Parada 2, Destino)
    const pinsFsph = screen.getAllByRole('img', { name: /Sintétic/i });
    expect(pinsFsph).toHaveLength(4);
    expect(pinsFsph[0]).toHaveAttribute('src', '/assets/FSPH_PIN.png');

    expect(screen.getByText('14,8 km')).toBeInTheDocument();
    expect(screen.getByText(/Método: OSRM/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Legenda do mapa')).toHaveTextContent('Rota planejada (OSRM)');
    expect(fetchSpy).not.toHaveBeenCalled();

    // Clicar no pin FSPH abre o balão de identificação do local e Escape fecha
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de Parada 1/i }));
    expect(screen.getByRole('dialog', { name: /Detalhes do ponto Parada 1/i })).toHaveTextContent(
      'Rua Capucho, 100',
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: /Detalhes do ponto Parada 1/i }),
    ).not.toBeInTheDocument();
  });

  it('no modo expansivel inicia recolhido com resumo e abre o mapa sob demanda', async () => {
    render(
      <VisualizadorRotaMapa
        titulo="Rota da solicitação"
        pontos={PONTOS_FIXTURE}
        rotaPlanejada={ROTA_PLANEJADA_OSRM}
        exibicaoMapa="expansivel"
      />,
    );

    expect(screen.queryByTestId('mock-maplibre')).not.toBeInTheDocument();
    const botaoAbrir = screen.getByRole('button', { name: /Ver mapa da rota/i });
    expect(botaoAbrir).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(botaoAbrir);
    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ocultar mapa/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('mock-maplibre')).not.toBeInTheDocument();
    });
  });

  it('usa linha tracejada de ligação aproximada quando não há polyline5', async () => {
    render(
      <VisualizadorRotaMapa
        pontos={[PONTOS_FIXTURE[0]!, PONTOS_FIXTURE[3]!]}
        rotaPlanejada={{ distanciaMetros: 8300, metodo: 'HAVERSINE_APROXIMADO', aproximada: true }}
      />,
    );

    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();
    await waitFor(() => {
      const layerAproximada = document.querySelector('[data-layer-id="rota-aproximada-linha"]');
      expect(layerAproximada).toBeInTheDocument();
      expect(layerAproximada).toHaveAttribute('data-dasharray', '4,3');
    });

    expect(document.querySelector('[data-source-id="rota-planejada"]')).not.toBeInTheDocument();
    expect(screen.getByText(/Traçado rodoviário indisponível/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Legenda do mapa')).toHaveTextContent('Ligação aproximada');
  });

  it('descarta polyline5 inválida sem quebrar e faz fallback para ligação aproximada', async () => {
    render(
      <VisualizadorRotaMapa
        pontos={[PONTOS_FIXTURE[0]!, PONTOS_FIXTURE[3]!]}
        rotaPlanejada={{ geometria: '!!!corrompida!!!', formatoGeometria: 'polyline5' }}
      />,
    );

    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();
    expect(screen.getByText(/geometria salva da rota está inválida/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('[data-source-id="rota-aproximada"]')).toBeInTheDocument();
    });
  });

  it('trata 1 ponto centralizado e 0 pontos ocultando o mapa com resumo textual', async () => {
    const { rerender } = render(<VisualizadorRotaMapa pontos={[PONTOS_FIXTURE[0]!]} />);

    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId('mock-maplibre-marker')).toHaveLength(1);
    });
    expect(document.querySelector('[data-source-id="rota-aproximada"]')).not.toBeInTheDocument();

    rerender(
      <VisualizadorRotaMapa
        pontos={[
          {
            tipo: 'ORIGEM',
            rotulo: 'Sede sem coord',
            endereco: 'Rua Manual, 10',
            coordenadas: null,
          },
          {
            tipo: 'DESTINO',
            rotulo: 'Destino sem coord',
            endereco: 'Av. Manual, 20',
            coordenadas: null,
          },
        ]}
      />,
    );

    expect(screen.queryByTestId('mock-maplibre')).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhum ponto possui coordenadas cadastradas/i)).toBeInTheDocument();
    expect(screen.getByText('Sede sem coord')).toBeInTheDocument();
    expect(screen.getByText('Destino sem coord')).toBeInTheDocument();
  });

  it('renderiza histórico completo com observados, estimados, círculo >150m, lacunas sem linha, odômetro neutro e zero OSRM', async () => {
    render(
      <VisualizadorRotaMapa
        titulo="Histórico da viagem #418"
        pontos={[PONTOS_FIXTURE[0]!, PONTOS_FIXTURE[3]!]}
        rotaPlanejada={ROTA_PLANEJADA_OSRM}
        historico={HISTORICO_FIXTURE}
        odometro={{ kmInicial: 42110, kmFinal: 42126 }}
      />,
    );

    expect(await screen.findByTestId('mock-maplibre')).toBeInTheDocument();

    await waitFor(() => {
      // 2 trechos observados separados (lacuna NÃO foi ligada em 1 única linha!)
      const sourceObs = document.querySelector('[data-source-id="rota-observada"]');
      expect(sourceObs).toHaveAttribute('data-features-count', '2');

      // 1 trecho estimado pontilhado
      const layerEst = document.querySelector('[data-layer-id="rota-estimada-linha"]');
      expect(layerEst).toHaveAttribute('data-dasharray', '1,2.5');

      // Apenas 1 círculo de incerteza (> 150m: 220m sim; 18m e 12m não)
      const sourceIncerteza = document.querySelector('[data-source-id="rota-incerteza"]');
      expect(sourceIncerteza).toHaveAttribute('data-features-count', '1');
    });

    // Aviso claro de interrupção de sinal GPS + item na linha do tempo
    expect(screen.getByText(/Interrupção de sinal GPS registrada/i)).toBeInTheDocument();
    expect(screen.getByText(/Sinal GPS interrompido \(08:22–08:41\)/i)).toBeInTheDocument();

    // Checkpoints com precisão e horário acessíveis
    expect(screen.getByText(/Precisão: ±220m/i)).toBeInTheDocument();
    expect(screen.getByText(/Precisão: ±18m/i)).toBeInTheDocument();

    // Comparativo neutro com odômetro (sem role="alert" de divergência)
    expect(screen.getByText('14,8 km')).toBeInTheDocument();
    expect(screen.getByText('16,0 km')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Zero chamadas OSRM/rede na renderização histórica
    expect(fetchSpy).not.toHaveBeenCalled();

    // Checkpoint coincidente com o destino é unificado no card do próprio pin FSPH
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de LACEN/i }));
    const dialogoDestino = screen.getByRole('dialog', { name: /Detalhes do ponto LACEN/i });
    expect(dialogoDestino).toHaveTextContent('Av. Beira Mar, Aracaju - SE');
    expect(dialogoDestino).toHaveTextContent(/GPS: Chegada/i);
  });

  it('apresenta fallback textual completo quando WebGL não está disponível', () => {
    vi.spyOn(suporteWebgl, 'verificarSuporteWebgl').mockReturnValue(false);

    render(
      <VisualizadorRotaMapa
        titulo="Rota sem WebGL"
        pontos={PONTOS_FIXTURE}
        rotaPlanejada={ROTA_PLANEJADA_OSRM}
        historico={HISTORICO_FIXTURE}
      />,
    );

    expect(screen.queryByTestId('mock-maplibre')).not.toBeInTheDocument();
    expect(screen.getByText(/Mapa indisponível no momento/i)).toBeInTheDocument();
    // Pontos, horários, precisão e legenda continuam acessíveis fora do canvas
    expect(screen.getByText('HEMOSE — Origem Sintética')).toBeInTheDocument();
    expect(screen.getByText(/Sinal GPS interrompido/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Legenda do mapa')).toBeInTheDocument();
  });
});
