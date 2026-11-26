import { describe, expect, it } from 'vitest';
import { prepararEventoViagem } from '../services/publicacaoEventosViagem';
import { montarAvisoViagemAgendada } from '../services/eventosViagemAdministrativa';

describe('Publicacao de eventos administrativos', () => {
  it('prepara A5 com a referencia correta e sem o autor', () => {
    const aviso = montarAvisoViagemAgendada(99);

    const evento = prepararEventoViagem(
      99,
      aviso,
      3,
      [30, 30, 3]
    );

    expect(evento.operacao).toBe('Administrativo');
    expect(evento.referencia).toEqual({
      tipo: 'VIAGEM_FROTA',
      id: 99,
    });
    expect(evento.autorId).toBe(3);
    expect(evento.destinatarios).toEqual([30]);
    expect(evento.push?.tag).toBe('viagem-99');
  });
});
