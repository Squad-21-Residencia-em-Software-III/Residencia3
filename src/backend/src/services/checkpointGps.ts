import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { coordenadasSchema } from '../validators/mapasSchemas';

const gps = coordenadasSchema.extend({
  precisaoMetros: z.number().nonnegative(),
  capturadoEm: z.iso.datetime({ offset: true }),
}).strict();
const motivo = z.string().trim().min(1).max(500);
const entrada = z.discriminatedUnion('origem', [
  z.strictObject({ origem: z.literal('GPS'), gps }),
  z.strictObject({ origem: z.literal('DISPENSA'), autorizacaoId: z.number().int().positive() }),
  z.strictObject({ origem: z.literal('REGISTRO_ADMINISTRATIVO'), motivo }),
  z.strictObject({ origem: z.literal('EMERGENCIA'), motivo }),
]);

type Marco =
  | { operacao: 'ADMINISTRATIVA'; viagemId: number; etapa: 'SAIDA' | 'FINAL' }
  | { operacao: 'ADMINISTRATIVA'; viagemId: number; etapa: 'PARADA'; paradaId: number; versao: number }
  | { operacao: 'SVO'; deslocamentoId: number; etapa: 'SAIDA' | 'FINAL' }
  | { operacao: 'SVO'; deslocamentoId: number; etapa: 'CHEGADA' | 'ENTREGA'; ordemId: number };

type Autorizacao = {
  id: number;
  marco: Marco;
  motoristaId: number;
  evidencia: 'GPS' | 'FOTO' | 'AMBAS';
  motivo: string;
};

interface ContextoCheckpoint {
  marco: Marco;
  // Identidade e permissões resolvidas no servidor sob a transação operacional.
  ator: { tipo: 'MOTORISTA'; id: number } | { tipo: 'ADMINISTRATIVO'; id: number };
  motoristaAtribuidoId: number;
  gpsObrigatorio: boolean;
  emergenciaHabilitada: boolean;
  recebidoEm: Date;
  // Autorização aprovada, vigente e disponível para consumo nesta transação.
  autorizacao?: Autorizacao;
}

function mesmoMarco(a: Marco, b: Marco): boolean {
  if (a.operacao === 'ADMINISTRATIVA' && b.operacao === 'ADMINISTRATIVA') {
    return a.viagemId === b.viagemId && a.etapa === b.etapa &&
      (a.etapa !== 'PARADA' || (b.etapa === 'PARADA' && a.paradaId === b.paradaId && a.versao === b.versao));
  }
  if (a.operacao === 'SVO' && b.operacao === 'SVO') {
    return a.deslocamentoId === b.deslocamentoId && a.etapa === b.etapa &&
      (!('ordemId' in a) || ('ordemId' in b && a.ordemId === b.ordemId));
  }
  return false;
}

export function prepararCheckpointGps(evidencia: unknown, contexto: ContextoCheckpoint) {
  const { ator, marco, recebidoEm } = contexto;
  if (ator.tipo === 'MOTORISTA' && ator.id !== contexto.motoristaAtribuidoId) {
    throw new AppError('Motorista sem vínculo com o marco operacional.', 403, 'GPS_ATOR_INDEVIDO');
  }
  if (evidencia === undefined) {
    if (!contexto.gpsObrigatorio) return null;
    throw new AppError('O marco exige GPS ou uma exceção válida.', 422, 'GPS_OBRIGATORIO');
  }

  const dados = entrada.parse(evidencia);
  const base = { marco, autorId: ator.id, recebidoEm };
  if (ator.tipo === 'ADMINISTRATIVO') {
    if (dados.origem !== 'REGISTRO_ADMINISTRATIVO') {
      throw new AppError('O registro administrativo exige justificativa própria.', 422, 'GPS_REGISTRO_ADMINISTRATIVO');
    }
    return { ...base, ...dados };
  }
  switch (dados.origem) {
    case 'GPS':
      return { ...base, ...dados, baixaPrecisao: dados.gps.precisaoMetros > 150 };
    case 'DISPENSA': {
      const autorizacao = contexto.autorizacao;
      if (!autorizacao || autorizacao.id !== dados.autorizacaoId || autorizacao.motoristaId !== ator.id ||
          autorizacao.evidencia === 'FOTO' || !mesmoMarco(autorizacao.marco, marco)) {
        throw new AppError('Dispensa de GPS inválida para o marco.', 422, 'GPS_DISPENSA_INVALIDA');
      }
      return { ...base, ...dados, motivo: autorizacao.motivo };
    }
    case 'EMERGENCIA':
      if (contexto.gpsObrigatorio && contexto.emergenciaHabilitada) {
        return { ...base, ...dados, revisaoPendente: true as const };
      }
      throw new AppError('Exceção emergencial indisponível.', 422, 'GPS_EMERGENCIA_INDISPONIVEL');
    default:
      throw new AppError('Ação administrativa indisponível para este perfil.', 403, 'GPS_ATOR_INDEVIDO');
  }
}
