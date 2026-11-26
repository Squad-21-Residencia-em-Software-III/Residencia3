import { describe, expect, it } from 'vitest';
import {
  montarAvisoViagemAgendada,
  EVENTOS_VIAGEM_ADMINISTRATIVA,
} from '../services/eventosViagemAdministrativa.js';

describe('Eventos administrativos A5-A8', () => {
  describe('A5 - Viagem agendada', () => {
    it('monta o aviso com Push e destino do motorista', () => {
      const aviso = montarAvisoViagemAgendada(50);

      expect(aviso.tipo).toBe(EVENTOS_VIAGEM_ADMINISTRATIVA.AGENDADA);
      expect(aviso.urlDestino).toBe('/viagens');
      expect(aviso.ocorrencia).toBe('1');
      expect(aviso.push).toEqual({
        categoria: 'VIAGENS',
        titulo: 'Nova viagem agendada',
        corpo: 'Você recebeu uma nova viagem. Confira no sistema.',
        tag: 'viagem-50',
      });
    });

    it('não inclui informações sensíveis no Push', () => {
      const aviso = montarAvisoViagemAgendada(50);

      expect(aviso.push).toBeDefined();
      expect(aviso.push?.corpo).not.toContain('50');
      expect(aviso.push?.corpo).not.toContain('destino');
      expect(aviso.push?.corpo).not.toContain('motorista');
    });
  });
});

describe('A7 - Viagem cancelada', () => {
  it('monta avisos com destinos diferentes para motorista e solicitante', async () => {
    const { montarAvisosViagemCancelada } = await import(
      '../services/eventosViagemAdministrativa.js'
    );

    const avisos = montarAvisosViagemCancelada(50);

    expect(avisos.motorista.tipo).toBe('VIAGEM_CANCELADA');
    expect(avisos.solicitante.tipo).toBe('VIAGEM_CANCELADA');

    expect(avisos.motorista.urlDestino).toBe('/viagens');
    expect(avisos.solicitante.urlDestino).toBe('/solicitacoes');

    expect(avisos.motorista.ocorrencia).toBe('1');
    expect(avisos.solicitante.ocorrencia).toBe('1');

    expect(avisos.motorista.push?.categoria).toBe('VIAGENS');
    expect(avisos.solicitante.push?.categoria).toBe('VIAGENS');

    expect(avisos.motorista.push?.tag).toBe('viagem-50');
    expect(avisos.solicitante.push?.tag).toBe('viagem-50');
  });

  it('nao expoe identificadores da viagem nos textos do Push', async () => {
    const { montarAvisosViagemCancelada } = await import(
      '../services/eventosViagemAdministrativa.js'
    );

    const avisos = montarAvisosViagemCancelada(50);

    for (const aviso of [avisos.motorista, avisos.solicitante]) {
      expect(aviso.push).toBeDefined();
      expect(aviso.push?.titulo).not.toContain('50');
      expect(aviso.push?.corpo).not.toContain('50');
    }
  });
});

describe('A8 - Viagem iniciada e finalizada', () => {
  it('gera eventos distintos para inicio e finalizacao', async () => {
    const { montarAvisosAndamentoViagem } = await import(
      '../services/eventosViagemAdministrativa.js'
    );

    const inicio = montarAvisosAndamentoViagem(50, 'INICIADA');
    const fim = montarAvisosAndamentoViagem(50, 'FINALIZADA');

    expect(inicio.gestor.tipo).toBe('VIAGEM_INICIADA');
    expect(fim.gestor.tipo).toBe('VIAGEM_FINALIZADA');

    expect(inicio.gestor.tipo).not.toBe(fim.gestor.tipo);

    expect(inicio.gestor.ocorrencia).toBe('1');
    expect(fim.gestor.ocorrencia).toBe('1');
  });

  it('utiliza destinos corretos e nao configura Push', async () => {
    const { montarAvisosAndamentoViagem } = await import(
      '../services/eventosViagemAdministrativa.js'
    );

    for (const fase of ['INICIADA', 'FINALIZADA'] as const) {
      const avisos = montarAvisosAndamentoViagem(50, fase);

      expect(avisos.gestor.urlDestino).toBe('/viagens');
      expect(avisos.solicitante.urlDestino).toBe('/solicitacoes');

      expect(avisos.gestor.push).toBeUndefined();
      expect(avisos.solicitante.push).toBeUndefined();
    }
  });
});

describe('A6 - viagem reprogramada', () => {
  it('deve manter ocorrencias distintas e os destinos corretos', async () => {
    const { montarAvisosViagemReprogramada } = await import(
      '../services/eventosViagemAdministrativa.js'
    );

    const primeira = montarAvisosViagemReprogramada(99, 'reprogramacao-1');
    const segunda = montarAvisosViagemReprogramada(99, 'reprogramacao-2');

    expect(primeira.motorista.tipo).toBe('VIAGEM_REPROGRAMADA');
    expect(primeira.motorista.urlDestino).toBe('/viagens');
    expect(primeira.solicitante.urlDestino).toBe('/solicitacoes');

    expect(primeira.motorista.push?.tag).toBe('viagem-99');
    expect(primeira.solicitante.push?.tag).toBe('viagem-99');

    expect(primeira.motorista.ocorrencia).not.toBe(
      segunda.motorista.ocorrencia
    );
  });
});
