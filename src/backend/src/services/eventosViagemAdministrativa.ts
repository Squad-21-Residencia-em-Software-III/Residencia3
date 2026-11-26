export const EVENTOS_VIAGEM_ADMINISTRATIVA = {
  AGENDADA: 'VIAGEM_AGENDADA',
  REPROGRAMADA: 'VIAGEM_REPROGRAMADA',
  CANCELADA: 'VIAGEM_CANCELADA',
  INICIADA: 'VIAGEM_INICIADA',
  FINALIZADA: 'VIAGEM_FINALIZADA',
} as const;

export const NOTIFICACAO_VIAGEM_ADMINISTRATIVA = {
  OPERACAO: 'Administrativo',
  REFERENCIA: 'VIAGEM_FROTA',
  CATEGORIA_PUSH: 'VIAGENS',
  DESTINO_MOTORISTA: '/viagens',
  DESTINO_SOLICITANTE: '/solicitacoes',
  DESTINO_GESTOR: '/viagens',
} as const;

export interface AvisoViagemAdministrativa {
  tipo: string;
  titulo: string;
  mensagem: string;
  urlDestino: string;
  ocorrencia: string;
  push?: {
    categoria: string;
    titulo: string;
    corpo: string;
    tag?: string;
  };
}

export function montarAvisoViagemAgendada(
  viagemId: number
): AvisoViagemAdministrativa {
  return {
    tipo: EVENTOS_VIAGEM_ADMINISTRATIVA.AGENDADA,
    titulo: 'Viagem agendada',
    mensagem: `A viagem nº ${viagemId} foi agendada para você.`,
    urlDestino: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.DESTINO_MOTORISTA,
    ocorrencia: '1',
    push: {
      categoria: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.CATEGORIA_PUSH,
      titulo: 'Nova viagem agendada',
      corpo: 'Você recebeu uma nova viagem. Confira no sistema.',
      tag: `viagem-${viagemId}`,
    },
  };
}

export function montarAvisosViagemCancelada(
  viagemId: number
): {
  motorista: AvisoViagemAdministrativa;
  solicitante: AvisoViagemAdministrativa;
} {
  const comum = {
    tipo: EVENTOS_VIAGEM_ADMINISTRATIVA.CANCELADA,
    titulo: 'Viagem cancelada',
    mensagem: `A viagem nº ${viagemId} foi cancelada.`,
    ocorrencia: '1',
  };

  return {
    motorista: {
      ...comum,
      urlDestino: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.DESTINO_MOTORISTA,
      push: {
        categoria: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.CATEGORIA_PUSH,
        titulo: 'Viagem cancelada',
        corpo: 'Uma viagem foi cancelada. Confira no sistema.',
        tag: `viagem-${viagemId}`,
      },
    },
    solicitante: {
      ...comum,
      urlDestino: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.DESTINO_SOLICITANTE,
      push: {
        categoria: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.CATEGORIA_PUSH,
        titulo: 'Viagem cancelada',
        corpo: 'Uma solicitação de viagem foi atualizada. Confira no sistema.',
        tag: `viagem-${viagemId}`,
      },
    },
  };
}

export function montarAvisosAndamentoViagem(
  viagemId: number,
  fase: 'INICIADA' | 'FINALIZADA'
): {
  gestor: AvisoViagemAdministrativa;
  solicitante: AvisoViagemAdministrativa;
} {
  const iniciada = fase === 'INICIADA';

  const comum = {
    tipo: iniciada
      ? EVENTOS_VIAGEM_ADMINISTRATIVA.INICIADA
      : EVENTOS_VIAGEM_ADMINISTRATIVA.FINALIZADA,
    titulo: iniciada ? 'Viagem iniciada' : 'Viagem finalizada',
    mensagem: iniciada
      ? `A viagem nº ${viagemId} foi iniciada.`
      : `A viagem nº ${viagemId} foi finalizada.`,
    ocorrencia: '1',
  };

  return {
    gestor: {
      ...comum,
      urlDestino: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.DESTINO_GESTOR,
    },
    solicitante: {
      ...comum,
      urlDestino: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.DESTINO_SOLICITANTE,
    },
  };
}

export function montarAvisosViagemReprogramada(
  viagemId: number,
  ocorrencia: string
): {
  motorista: AvisoViagemAdministrativa;
  solicitante: AvisoViagemAdministrativa;
} {
  const comum = {
    tipo: EVENTOS_VIAGEM_ADMINISTRATIVA.REPROGRAMADA,
    titulo: 'Viagem reprogramada',
    mensagem: `A programação da viagem nº ${viagemId} foi alterada.`,
    ocorrencia,
  };

  return {
    motorista: {
      ...comum,
      urlDestino: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.DESTINO_MOTORISTA,
      push: {
        categoria: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.CATEGORIA_PUSH,
        titulo: 'Viagem reprogramada',
        corpo: 'A programação de uma viagem foi alterada. Confira no sistema.',
        tag: `viagem-${viagemId}`,
      },
    },
    solicitante: {
      ...comum,
      urlDestino: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.DESTINO_SOLICITANTE,
      push: {
        categoria: NOTIFICACAO_VIAGEM_ADMINISTRATIVA.CATEGORIA_PUSH,
        titulo: 'Viagem reprogramada',
        corpo: 'Sua solicitação teve a programação alterada. Confira no sistema.',
        tag: `viagem-${viagemId}`,
      },
    },
  };
}
