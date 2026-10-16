import type { Usuario } from '../../types/usuario';

/**
 * DADOS FICTÍCIOS (mock). Não vêm do banco nem da API.
 * Baseados nos usuários do seed do backend:
 * src/backend/database/seeds/01_dados_iniciais.js
 * Adicionado usuário inativo para permitir teste dos filtros de status no frontend.
 */
export const MOCK_USUARIOS: Usuario[] = [
  {
    id: 1,
    nome: 'Carlos Silva',
    email: 'admin@exemplo.com',
    tipo_usuario: 'ADMINISTRADOR',
    perfil: 'ADMINISTRADOR',
    ativo: true,
  },
  {
    id: 2,
    nome: 'Mariana Souza',
    email: 'solicitante@exemplo.com',
    tipo_usuario: 'SOLICITANTE',
    perfil: 'SOLICITANTE',
    ativo: true,
  },
  {
    id: 3,
    nome: 'Roberto Mendes',
    email: 'gestor.frota@exemplo.com',
    tipo_usuario: 'GESTOR_FROTA',
    perfil: 'GESTOR_FROTA',
    ativo: true,
  },
  {
    id: 4,
    nome: 'Ana Paula Lima',
    email: 'gestor.svo@exemplo.com',
    tipo_usuario: 'GESTOR_SVO',
    perfil: 'GESTOR_SVO',
    ativo: true,
  },
  {
    id: 5,
    nome: 'João Santos',
    email: 'motorista.frota@exemplo.com',
    tipo_usuario: 'MOTORISTA',
    perfil: 'MOTORISTA_FROTA',
    ativo: true,
  },
  {
    id: 6,
    nome: 'Marcos Oliveira',
    email: 'motorista.svo@exemplo.com',
    tipo_usuario: 'MOTORISTA',
    perfil: 'MOTORISTA_SVO',
    ativo: true,
  },
  {
    id: 7,
    nome: 'Pedro Vencido',
    email: 'motorista.vencido@exemplo.com',
    tipo_usuario: 'MOTORISTA',
    perfil: 'MOTORISTA_FROTA',
    ativo: true,
  },
  {
    id: 8,
    nome: 'Juliana Costa',
    email: 'juliana.costa@exemplo.com',
    tipo_usuario: 'SOLICITANTE',
    perfil: 'SOLICITANTE',
    ativo: false,
  },
];
