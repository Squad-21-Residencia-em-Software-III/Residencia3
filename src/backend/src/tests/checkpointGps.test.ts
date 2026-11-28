import { describe, expect, it } from 'vitest';
import { prepararCheckpointGps } from '../services/checkpointGps';

const marco = { operacao: 'SVO', deslocamentoId: 10, ordemId: 20, etapa: 'ENTREGA' } as const;
const recebidoEm = new Date('2026-11-27T12:00:00Z');
const contexto = { marco, recebidoEm, ator: { tipo: 'MOTORISTA', id: 1 } as const,
  motoristaAtribuidoId: 1, gpsObrigatorio: true, emergenciaHabilitada: false };
const ponto = { latitude: -10, longitude: -37, precisaoMetros: 153, capturadoEm: '2026-11-27T11:59:30Z' };
const dispensa = { origem: 'DISPENSA', autorizacaoId: 5 };

describe('validação de checkpoints GPS', () => {
  it('preserva o horário original e aceita baixa precisão com alerta', () => {
    expect(prepararCheckpointGps({ origem: 'GPS', gps: ponto }, contexto))
      .toMatchObject({ gps: ponto, recebidoEm, baixaPrecisao: true });
    expect(() => prepararCheckpointGps({ origem: 'GPS', gps: { ...ponto, latitude: 91 } }, contexto)).toThrow();
    expect(() => prepararCheckpointGps({ origem: 'GPS', gps: { ...ponto, capturadoEm: 'agora' } }, contexto)).toThrow();
  });
  it('vincula dispensa ao tipo de evidência, motorista, ordem e marco', () => {
    const autorizacao = { id: 5, marco, motoristaId: 1, evidencia: 'GPS' as const, motivo: 'Autorização sintética' };
    expect(prepararCheckpointGps(dispensa, { ...contexto, autorizacao })).toMatchObject({ motivo: autorizacao.motivo });
    expect(() => prepararCheckpointGps(dispensa, { ...contexto, autorizacao: { ...autorizacao, evidencia: 'FOTO' } }))
      .toThrow(expect.objectContaining({ codigo: 'GPS_DISPENSA_INVALIDA' }));
    expect(() => prepararCheckpointGps(dispensa, { ...contexto, autorizacao: {
      ...autorizacao, marco: { ...marco, ordemId: 21 },
    } })).toThrow();
    expect(() => prepararCheckpointGps({ origem: 'GPS', gps: ponto }, { ...contexto, motoristaAtribuidoId: 2 })).toThrow();
  });
  it('mantém legado, exige GPS no modo obrigatório e registra exceções sem coordenadas fictícias', () => {
    expect(prepararCheckpointGps(undefined, { ...contexto, gpsObrigatorio: false })).toBeNull();
    expect(() => prepararCheckpointGps(undefined, contexto)).toThrow();
    const emergencia = { origem: 'EMERGENCIA', motivo: 'GPS indisponível' };
    expect(() => prepararCheckpointGps(emergencia, contexto)).toThrow();
    expect(prepararCheckpointGps(emergencia, { ...contexto, emergenciaHabilitada: true }))
      .toMatchObject({ revisaoPendente: true, motivo: emergencia.motivo });
    const administrativo = { ...contexto, ator: { tipo: 'ADMINISTRATIVO', id: 2 } as const };
    expect(() => prepararCheckpointGps({ origem: 'GPS', gps: ponto }, administrativo)).toThrow();
    expect(prepararCheckpointGps({ origem: 'REGISTRO_ADMINISTRATIVO', motivo: 'Ação autorizada' }, administrativo))
      .toEqual({ marco, recebidoEm, autorId: 2, origem: 'REGISTRO_ADMINISTRATIVO', motivo: 'Ação autorizada' });
  });
});
