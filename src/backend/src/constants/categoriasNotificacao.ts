import { PERFIS, type Perfil } from './perfis';

/**
 * Categorias de alerta no aparelho (SCRUM-237), na ordem mostrada nas preferências. `codigo` é o mesmo de
 * `preferencias_notificacao.categoria` e de `publicarNotificacao({ push: { categoria } })`. Cada perfil só vê
 * e só recebe as suas: a regra é conferida na escolha e de novo na hora do envio (o perfil pode mudar).
 */
export interface CategoriaPush {
  codigo: string;
  titulo: string;
  descricao: string;
  perfis: readonly Perfil[];
}

const { ADMINISTRADOR, SOLICITANTE, GESTOR_FROTA, MOTORISTA_FROTA, GESTOR_SVO, MOTORISTA_SVO, INTEGRANTE_SVO } = PERFIS;

export const CATALOGO_CATEGORIAS_PUSH: readonly CategoriaPush[] = [
  {
    codigo: 'SOLICITACOES',
    titulo: 'Solicitações',
    descricao: 'Nova solicitação, aprovação, recusa e expiração.',
    perfis: [SOLICITANTE, GESTOR_FROTA, ADMINISTRADOR],
  },
  {
    codigo: 'VIAGENS',
    titulo: 'Viagens',
    descricao: 'Agendamento, mudança e cancelamento.',
    perfis: [SOLICITANTE, GESTOR_FROTA, MOTORISTA_FROTA],
  },
  {
    codigo: 'ODOMETRO',
    titulo: 'Odômetro',
    descricao: 'Pendências e exceções no registro do odômetro.',
    perfis: [GESTOR_FROTA, MOTORISTA_FROTA],
  },
  {
    codigo: 'SVO',
    titulo: 'SVO',
    descricao: 'Ordens, designações e atrasos do SVO.',
    perfis: [GESTOR_SVO, MOTORISTA_SVO, INTEGRANTE_SVO],
  },
];

export function categoriasDoPerfil(perfil: string): CategoriaPush[] {
  return CATALOGO_CATEGORIAS_PUSH.filter((categoria) => (categoria.perfis as readonly string[]).includes(perfil));
}

export function categoriaPermitida(perfil: string, codigo: string): boolean {
  return categoriasDoPerfil(perfil).some((categoria) => categoria.codigo === codigo);
}
