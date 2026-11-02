/**
 * Serviço de API da associação gestor ↔ unidade (BL15 / SCRUM-142).
 *
 * CONTRATO PROVISÓRIO — as rotas e os campos abaixo são uma SUPOSIÇÃO até a API da
 * SCRUM-82 existir. Todo o contrato está concentrado neste arquivo para facilitar o ajuste.
 * Não há dado simulado/local: tudo vem e vai para a API.
 *
 *   GET    /unidades                      -> Unidade[] (cada uma com `gestores`)
 *   POST   /unidades/:id/gestores         -> body { gestorId }  (associa)
 *   DELETE /unidades/:id/gestores/:gestorId                     (remove a associação)
 *   GET    /usuarios?perfil=&ativo=true   -> candidatos a gestor (rota já existente)
 */
import type { Perfil, Usuario } from '../../types/usuario';
import { PERFIS } from '../../types/usuario';
import type { Unidade } from '../../types/unidade';
import { request } from './http';

/**
 * PROVISÓRIO: perfis exibidos como candidatos a gestor de unidade. A regra (SCRUM-81)
 * ainda não definiu quais perfis podem ser gestores de unidade.
 */
export const PERFIS_CANDIDATOS_GESTOR: Perfil[] = [PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO];

interface ListaUsuarios {
  dados: Usuario[];
}

export const unidadesApi = {
  listar: () => request<Unidade[]>('GET', '/unidades'),

  associarGestor: (unidadeId: number, gestorId: number) =>
    request<void>('POST', `/unidades/${unidadeId}/gestores`, { body: { gestorId } }),

  removerGestor: (unidadeId: number, gestorId: number) =>
    request<void>('DELETE', `/unidades/${unidadeId}/gestores/${gestorId}`),

  /** Usuários ativos que podem ser associados (rota /usuarios já existente no backend). */
  listarCandidatos: async (): Promise<Usuario[]> => {
    const listas = await Promise.all(
      PERFIS_CANDIDATOS_GESTOR.map((perfil) =>
        request<ListaUsuarios>('GET', '/usuarios', { query: { perfil, ativo: true, limite: 100 } }),
      ),
    );
    return listas.flatMap((l) => l.dados);
  },
};
