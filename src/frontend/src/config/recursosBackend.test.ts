import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Visibilidade dos recursos operacionais', () => {
  it('mantém o portal manual e acompanhamento independentes das flags de mapas', async () => {
    vi.stubEnv('VITE_PORTAL_SVO_ATIVO', 'true');
    vi.stubEnv('VITE_ACOMPANHAMENTO_EXTERNO_SVO_ATIVO', 'true');
    vi.stubEnv('VITE_MAPAS_INTERNOS_ATIVOS', 'sim');
    vi.stubEnv('VITE_MAPAS_SVO_ATIVOS', 'false');
    const { recursoAtivo } = await import('./recursosBackend');
    expect(recursoAtivo('portalSvo')).toBe(true);
    expect(recursoAtivo('acompanhamentoExterno')).toBe(true);
    expect(recursoAtivo('mapasInternos')).toBe(false);
    expect(recursoAtivo('mapasSvo')).toBe(false);
  });

  it.each([
    [undefined, undefined, false],
    [undefined, 'true', true],
    ['true', undefined, true],
    ['true', 'true', true],
    ['false', 'true', false],
    ['true', 'false', false],
    ['', 'true', false],
    ['true', 'sim', false],
  ])('resolve acompanhamento com flag atual %s e legada %s', async (atual, legado, ativo) => {
    vi.stubEnv('VITE_ACOMPANHAMENTO_EXTERNO_SVO_ATIVO', atual);
    vi.stubEnv('VITE_FASE3_ACOMPANHAMENTO_EXTERNO', legado);
    const { recursoAtivo } = await import('./recursosBackend');
    expect(recursoAtivo('acompanhamentoExterno')).toBe(ativo);
  });

  it('só exibe controles dependentes com as respectivas flags', async () => {
    vi.stubEnv('VITE_EMERGENCIA_GPS_ATIVA', 'true');
    vi.stubEnv('VITE_CONFIRMACAO_AUTOMATICA_PARADAS_ATIVA', 'true');
    const { recursoAtivo } = await import('./recursosBackend');
    expect(recursoAtivo('emergenciaGps')).toBe(false);
    expect(recursoAtivo('confirmacaoAutomatica')).toBe(false);
    vi.resetModules();
    vi.stubEnv('VITE_GPS_OBRIGATORIO_ATIVO', 'true');
    vi.stubEnv('VITE_MULTIPLAS_PARADAS_ATIVAS', 'true');
    vi.stubEnv('VITE_CAPTURA_PERIODICA_GPS_ATIVA', 'true');
    const { recursoAtivo: recursoDepois } = await import('./recursosBackend');
    expect(recursoDepois('emergenciaGps')).toBe(true);
    expect(recursoDepois('confirmacaoAutomatica')).toBe(true);
  });
});
