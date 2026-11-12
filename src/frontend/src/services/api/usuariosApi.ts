import { request } from './http';
import type { AtualizarUsuarioInput, NovoUsuarioInput, Perfil, Usuario } from '../../types/usuario';

export interface ListarUsuariosFiltros {
  pagina?: number;
  limite?: number;
  busca?: string;
  perfil?: Perfil;
  ativo?: boolean;
}

export interface UsuariosPaginados {
  dados: Usuario[];
  paginacao: {
    pagina: number;
    limite: number;
    total: number;
    totalPaginas: number;
  };
}

export interface PerfilDescricao {
  perfil: Perfil;
  descricao: string;
}

export const usuariosApi = {
  listar: (filtros: ListarUsuariosFiltros = {}) =>
    request<UsuariosPaginados>('GET', '/usuarios', {
      query: {
        pagina: filtros.pagina,
        limite: filtros.limite,
        busca: filtros.busca,
        perfil: filtros.perfil,
        ativo: filtros.ativo !== undefined ? String(filtros.ativo) : undefined,
      },
    }),

  buscarPorId: (id: number) => request<Usuario>('GET', `/usuarios/${id}`),

  criar: (dados: NovoUsuarioInput) =>
    request<Usuario>('POST', '/usuarios', { body: dados }),

  atualizar: (id: number, dados: AtualizarUsuarioInput) =>
    request<Usuario>('PATCH', `/usuarios/${id}`, { body: dados }),

  redefinirSenha: (id: number, senha: string) =>
    request<void>('PATCH', `/usuarios/${id}/senha`, { body: { senha } }),

  listarPerfis: () => request<PerfilDescricao[]>('GET', '/usuarios/perfis'),
};

