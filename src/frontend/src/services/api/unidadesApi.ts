/**
 * Serviço de API de unidades e associação gestor ↔ unidade (BL15).
 *
 *   GET    /unidades                         -> Unidade[] (qualquer usuário autenticado)
 *   GET    /unidades/gestores                -> UnidadeComGestores[] (ADMIN)
 *   POST   /unidades/:id/gestores            -> body { gestor_id } -> 201 UnidadeComGestores (409 se já associado)
 *   DELETE /unidades/:id/gestores/:gestorId  -> 204 (404 se não existir)
 *   GET    /usuarios?perfil=&ativo=true      -> candidatos a gestor
 */
import type { Usuario } from '../../types/usuario';
import { PERFIS_CANDIDATOS_GESTOR, type Unidade, type UnidadeComGestores } from '../../types/unidade';
import { request } from './http';

interface ListaUsuarios {
  dados: Usuario[];
}

export const unidadesApi = {
  /** Opções de unidade para a solicitação de viagem, sem dados dos gestores. */
  listarOpcoes: () => request<Unidade[]>('GET', '/unidades'),

  /** Unidades com os gestores associados (somente ADMIN). */
  listarComGestores: () => request<UnidadeComGestores[]>('GET', '/unidades/gestores'),

  associarGestor: (unidadeId: number, gestorId: number) =>
    request<UnidadeComGestores>('POST', `/unidades/${unidadeId}/gestores`, { body: { gestor_id: gestorId } }),

  removerGestor: (unidadeId: number, gestorId: number) =>
    request<void>('DELETE', `/unidades/${unidadeId}/gestores/${gestorId}`),

  /** Usuários ativos com perfil que pode gerir alguma unidade (limite máximo da API: 100). */
  listarCandidatos: async (): Promise<Usuario[]> => {
    const listas = await Promise.all(
      PERFIS_CANDIDATOS_GESTOR.map((perfil) =>
        request<ListaUsuarios>('GET', '/usuarios', { query: { perfil, ativo: true, limite: 100 } }),
      ),
    );
    return listas.flatMap((l) => l.dados);
  },
};
