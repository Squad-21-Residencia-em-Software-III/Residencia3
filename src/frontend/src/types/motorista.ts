/**
 * Espelha a tabela `motoristas` do banco (migration 20261014000001_create_initial_schema.js).
 * `nome` NÃO é coluna de `motoristas`: vem de `usuarios.nome` via `usuario_id`.
 */
export type TipoMotorista = 'FROTA' | 'SVO';
// Status controlado pelo backend (viagemService): DESIGNADO ao criar viagem, EM_VIAGEM ao iniciar.
export type StatusMotorista = 'DISPONIVEL' | 'DESIGNADO' | 'EM_VIAGEM' | 'AFASTADO' | 'INATIVO';

export interface Motorista {
  id: number;
  usuario_id: number;
  nome: string; // vem de usuarios.nome (join)
  numero_cnh: string; // varchar(20), único
  categoria_cnh: string; // varchar(5)
  validade_cnh: string; // date (AAAA-MM-DD)
  tipo_motorista: TipoMotorista; // varchar(20)
  status: StatusMotorista; // padrão no banco: DISPONIVEL
}
