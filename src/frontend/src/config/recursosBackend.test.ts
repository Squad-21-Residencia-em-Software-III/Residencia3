import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Visibilidade de recursos da Fase 3', () => {
  it('mantém o portal manual e acompanhamento independentes das flags de mapas', async () => {
    vi.stubEnv('VITE_FASE3_PORTAL_SVO', 'true');
    vi.stubEnv('VITE_FASE3_ACOMPANHAMENTO_EXTERNO', 'true');
    vi.stubEnv('VITE_FASE3_MAPAS_INTERNOS', 'sim');
    vi.stubEnv('VITE_FASE3_MAPAS_SVO', 'false');
    const { recursoAtivo } = await import('./recursosBackend');
    expect(recursoAtivo('portalSvo')).toBe(true);
    expect(recursoAtivo('acompanhamentoExterno')).toBe(true);
    expect(recursoAtivo('mapasInternos')).toBe(false);
    expect(recursoAtivo('mapasSvo')).toBe(false);
  });

  it('só exibe controles dependentes com as respectivas flags', async () => {
    vi.stubEnv('VITE_FASE3_EMERGENCIA_GPS', 'true');
    vi.stubEnv('VITE_FASE3_CONFIRMACAO_AUTOMATICA', 'true');
    const { recursoAtivo } = await import('./recursosBackend');
    expect(recursoAtivo('emergenciaGps')).toBe(false);
    expect(recursoAtivo('confirmacaoAutomatica')).toBe(false);
    vi.resetModules();
    vi.stubEnv('VITE_FASE3_GPS_OBRIGATORIO', 'true');
    vi.stubEnv('VITE_FASE3_MULTIPLAS_PARADAS', 'true');
    vi.stubEnv('VITE_FASE3_CAPTURA_PERIODICA', 'true');
    const { recursoAtivo: recursoDepois } = await import('./recursosBackend');
    expect(recursoDepois('emergenciaGps')).toBe(true);
    expect(recursoDepois('confirmacaoAutomatica')).toBe(true);
  });
});
