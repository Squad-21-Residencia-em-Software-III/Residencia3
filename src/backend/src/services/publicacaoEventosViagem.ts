import type { AvisoViagemAdministrativa } from './eventosViagemAdministrativa';

export interface EventoViagemParaPublicacao extends AvisoViagemAdministrativa {
  operacao: 'Administrativo';
  referencia: {
    tipo: 'VIAGEM_FROTA';
    id: number;
  };
  autorId: number | null;
  destinatarios: number[];
}

export function prepararEventoViagem(
  viagemId: number,
  aviso: AvisoViagemAdministrativa,
  autorId: number | null,
  destinatarios: number[]
): EventoViagemParaPublicacao {
  return {
    ...aviso,
    operacao: 'Administrativo',
    referencia: {
      tipo: 'VIAGEM_FROTA',
      id: viagemId,
    },
    autorId,
    destinatarios: [...new Set(destinatarios)].filter(
      (id) => id !== autorId
    ),
  };
}

export type PublicadorEventoViagem = (
  trx: import('knex').Knex.Transaction,
  evento: EventoViagemParaPublicacao
) => Promise<{ criadas: number }>;
