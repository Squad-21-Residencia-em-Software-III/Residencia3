import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

export function escritaMotoristasLigada(valor: string | undefined): boolean {
  const escolha = (valor ?? '').trim() || 'false';
  if (escolha !== 'true' && escolha !== 'false') throw new Error('MOTORISTAS_ESCRITA_ATIVA deve ser true ou false');
  return escolha === 'true';
}

/**
 * SCRUM-308: cadastro e edição de CNH (`POST /motoristas`, `PATCH /motoristas/:id`, `GET /motoristas/:id`
 * e `GET /motoristas/usuarios-elegiveis`). Desligado por padrão até a confirmação institucional da
 * matriz por ação e unidade (docs/scrum-308-cadastro-cnh.md). Desligado, as rotas respondem 404.
 */
export const configMotoristas = { escritaAtiva: escritaMotoristasLigada(process.env.MOTORISTAS_ESCRITA_ATIVA) };
