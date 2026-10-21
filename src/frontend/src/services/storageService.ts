import type { Usuario, NovoUsuarioInput, AtualizarUsuarioInput } from '../types/usuario';
import { MOCK_USUARIOS } from './mocks/usuariosMock';
import { tipoUsuarioDoPerfil } from '../types/usuario';

const STORAGE_KEY = '@fsph:usuarios';

/**
 * Serviço de persistência local para Usuários.
 * Implementa o cache solicitado para que a interface reflita mudanças
 * imediatamente e persista após o recarregamento da página (F5).
 */
export const storageService = {
  /**
   * Recupera a lista de usuários do localStorage.
   * Se estiver vazio, popula com os dados do mock inicial.
   */
  getUsuarios: (): Usuario[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_USUARIOS));
      return MOCK_USUARIOS;
    }
    return JSON.parse(stored);
  },

  /**
   * Salva a lista completa de usuários no localStorage.
   */
  saveTodosUsuarios: (usuarios: Usuario[]): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usuarios));
  },

  /**
   * Cria um novo usuário, gera um ID único e persiste no cache.
   * @throws Erro se o e-mail já estiver cadastrado.
   */
  createUsuario: (input: NovoUsuarioInput): Usuario => {
    const usuarios = storageService.getUsuarios();

    // Validação de e-mail único (Requisito Yarlley)
    const emailExiste = usuarios.some(u => u.email.toLowerCase() === input.email.toLowerCase());
    if (emailExiste) {
      throw new Error('Este e-mail já está cadastrado no sistema.');
    }

    const novoUsuario: Usuario = {
      id: usuarios.length > 0 ? Math.max(...usuarios.map(u => u.id)) + 1 : 1,
      nome: input.nome,
      email: input.email.toLowerCase(),
      perfil: input.perfil,
      tipo_usuario: tipoUsuarioDoPerfil(input.perfil),
      ativo: true,
    };

    const usuariosAtualizados = [novoUsuario, ...usuarios];
    storageService.saveTodosUsuarios(usuariosAtualizados);

    return novoUsuario;
  },

  /**
   * Atualiza dados de um usuário existente no cache.
   */
  updateUsuario: (id: number, input: AtualizarUsuarioInput): Usuario => {
    const usuarios = storageService.getUsuarios();
    const index = usuarios.findIndex(u => u.id === id);

    if (index === -1) {
      throw new Error('Usuário não encontrado.');
    }

    const usuarioAtualizado = {
      ...usuarios[index],
      ...input,
      // Se o perfil mudar, atualizamos automaticamente o tipo_usuario
      ...(input.perfil ? { tipo_usuario: tipoUsuarioDoPerfil(input.perfil) } : {}),
    };

    usuarios[index] = usuarioAtualizado;
    storageService.saveTodosUsuarios(usuarios);

    return usuarioAtualizado;
  },

  /**
   * Altera apenas o status de ativo/inativo de um usuário.
   */
  toggleStatusUsuario: (id: number, status: boolean): Usuario => {
    return storageService.updateUsuario(id, { ativo: status });
  },

  /**
   * Remove um usuário do cache.
   */
  deleteUsuario: (id: number): void => {
    const usuarios = storageService.getUsuarios().filter(u => u.id !== id);
    storageService.saveTodosUsuarios(usuarios);
  },
};
