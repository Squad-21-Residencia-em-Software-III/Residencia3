/**
 * Espelha a tabela `motoristas` do banco (migration 20261014000001_create_initial_schema.js).
 * `nome` NÃO é coluna de `motoristas`: vem de `usuarios.nome` via `usuario_id`.
 */
export type TipoMotorista = 'FROTA' | 'SVO';
// Status controlado pelo backend (viagemService): DESIGNADO ao criar viagem, EM_VIAGEM ao iniciar.
export type StatusMotorista = 'DISPONIVEL' | 'DESIGNADO' | 'EM_VIAGEM' | 'AFASTADO' | 'INATIVO';

/** Campos comuns à lista e ao próprio perfil, sem a CNH. */
export interface MotoristaBase {
  id: number;
  usuario_id: number;
  nome: string; // vem de usuarios.nome (join)
  categoria_cnh: string; // varchar(5)
  validade_cnh: string; // date (AAAA-MM-DD)
  tipo_motorista: TipoMotorista; // varchar(20)
  status: StatusMotorista; // padrão no banco: DISPONIVEL
}

/** Item de `GET /motoristas`: a CNH vem só com os 4 dígitos finais (SCRUM-308). */
export interface Motorista extends MotoristaBase {
  cnh_final: string;
}

/** `GET /motoristas/me`: o próprio motorista vê a CNH completa. */
export interface MotoristaComCnh extends MotoristaBase {
  numero_cnh: string; // texto: preserva zeros à esquerda
}

/** `GET/POST/PATCH /motoristas/:id`: fluxo de edição autorizado (SCRUM-308). */
export interface MotoristaDetalhe extends MotoristaComCnh {
  cnh_vencida: boolean;
}

/** `GET /motoristas/usuarios-elegiveis`: usuários motoristas ainda sem registro. */
export interface UsuarioElegivel {
  id: number;
  nome: string;
  perfil: 'MOTORISTA_FROTA' | 'MOTORISTA_SVO';
}

export interface CriarMotoristaInput {
  usuario_id: number;
  numero_cnh: string;
  categoria_cnh: string;
  validade_cnh: string;
}

export type AtualizarMotoristaInput = Partial<Omit<CriarMotoristaInput, 'usuario_id'>>;
