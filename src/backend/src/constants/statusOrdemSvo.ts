export const ORDENS_SVO_EM_CURSO = ['EM_DESLOCAMENTO', 'NO_LOCAL'] as const;
export const ORDENS_SVO_COM_RESERVA = ['ALOCADA', ...ORDENS_SVO_EM_CURSO] as const;

export function ordemSvoEmCurso(status: string): boolean {
  return ORDENS_SVO_EM_CURSO.some((estado) => estado === status);
}
