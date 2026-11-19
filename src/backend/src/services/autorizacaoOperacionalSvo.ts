import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import type { TipoOperacao } from '../validators/viagemSchemas';

// Não altera a autorização de gestão nem a leitura de evidências.
export function garantirPerfilOperacional(tipo: TipoOperacao, autor: { perfil: Perfil }): void {
  if (tipo === 'SVO' && autor.perfil !== PERFIS.MOTORISTA_SVO) {
    throw new AppError('Apenas o motorista SVO responsável pode operar a coleta', 403);
  }
}
