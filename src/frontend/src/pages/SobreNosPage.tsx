import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { Card, Badge } from '../components/ui';
import type { BadgeTone } from '../components/ui';

interface MembroEquipe {
  nome: string;
  usuarioGit: string;
  especialidade: string;
  tom: BadgeTone;
  descricao: string;
  entregas: [string, string];
}

const MEMBROS: MembroEquipe[] = [
  {
    nome: 'Yarllei Lima',
    usuarioGit: 'Yarllei01',
    especialidade: 'Full Stack',
    tom: 'info',
    descricao:
      'Padronizou a interface com Tailwind CSS, integrou a Agenda à API e implementou o download de relatórios nas telas. Também ampliou as APIs da frota e seus testes.',
    entregas: [
      'Componentes compartilhados e integração dos módulos operacionais.',
      'APIs de veículos, manutenção e infrações, com testes de integração.',
    ],
  },
  {
    nome: 'Vinícius Reis',
    usuarioGit: 'Loboock',
    especialidade: 'Full Stack',
    tom: 'info',
    descricao:
      'Implementou a navegação por perfil, os fluxos de coleta SVO e a tela de Auditoria. Desenvolveu os formulários e a API de evidências fotográficas do odômetro.',
    entregas: [
      'Separação das solicitações, viagens e veículos por tipo de frota.',
      'Captura de fotos na saída e na chegada e consulta autorizada na Auditoria.',
    ],
  },
  {
    nome: 'Arthur Kaylan',
    usuarioGit: 'kaylan-sx',
    especialidade: 'Full Stack',
    tom: 'info',
    descricao:
      'Implementou as interfaces de alocação de veículos e equipes e de acompanhamento das coletas SVO. Ajustou as regras de ocupação no back-end e ampliou a cobertura de testes.',
    entregas: [
      'Disponibilidade e ocupação dos veículos na análise da solicitação.',
      'Tratamento da coleta no local na Agenda e nas regras de disponibilidade.',
    ],
  },
  {
    nome: 'Gabriel Alves',
    usuarioGit: 'bieldb',
    especialidade: 'Back-end',
    tom: 'purple',
    descricao:
      'Implementou a API de registro de solicitações SVO e reforçou a segurança de sessão e as permissões por perfil e registro. Documentou as proteções da API e testou a matriz de acesso.',
    entregas: [
      'Renovação de sessão com cookie HttpOnly e invalidação de sessões.',
      'Restrições de acesso, limites de requisições e testes de autorização.',
    ],
  },
  {
    nome: 'João Guilherme',
    usuarioGit: 'JGui133',
    especialidade: 'Back-end',
    tom: 'purple',
    descricao:
      'Implementou a consulta de auditoria e regras para viagens e coletas SVO. Também separou a gestão de veículos por frota e perfil e padronizou os logs da API.',
    entregas: [
      'Consulta paginada de auditoria e tratamento de dados sensíveis nos logs.',
      'Disponibilidade de equipes e recusa justificada de solicitações SVO.',
    ],
  },
  {
    nome: 'Leonardo H.',
    usuarioGit: 'Cerolazkto',
    especialidade: 'Back-end',
    tom: 'purple',
    descricao:
      'Criou a consulta de ocupação de veículos SVO e implementou a atualização do status da coleta ao chegar ao local. A entrega incluiu uma migração e testes de rota e serviço.',
    entregas: [
      'Consulta da ocupação em relação à capacidade do veículo.',
      'Transição de status da coleta e integração com a fila e a Agenda SVO.',
    ],
  },
  {
    nome: 'Lorena Mariah Oliveira Lima',
    usuarioGit: 'Lorena2423',
    especialidade: 'Back-end',
    tom: 'purple',
    descricao:
      'Implementou a triagem SVO com geração de ordens e a validação de capacidade e disponibilidade na alocação de veículos. Também desenvolveu a exportação de relatórios em PDF, Excel e CSV.',
    entregas: [
      'Migração, regras e testes para confirmação de solicitações SVO.',
      'Exportadores de relatórios e documentação dos fluxos de exportação e alocação.',
    ],
  },
  {
    nome: 'Gabriel Arruda Cordeiro',
    usuarioGit: 'GArrudaC',
    especialidade: 'Banco de Dados · Infraestrutura',
    tom: 'warning',
    descricao:
      'Modelou equipes, agendamentos e evidências do odômetro no PostgreSQL. Validou desempenho de consultas e recuperação de backups e atualizou o dicionário de dados.',
    entregas: [
      'Migrações para vínculos, designações e metadados do odômetro.',
      'Índices, ajuste do pool de conexões e correções na restauração de backups.',
    ],
  },
  {
    nome: 'Matheus Andrade',
    usuarioGit: 'Theseus04',
    especialidade: 'Full Stack · DevOps',
    tom: 'neutral',
    descricao:
      'Automatizou verificações de segurança no CI/CD e registrou os passos de homologação. Implementou o cadastro de equipes e integrantes SVO na interface e na API, com testes de regressão.',
    entregas: [
      'Designação de equipes e integrantes e acompanhamento de coletas SVO.',
      'Testes de material sensível e armazenamento persistente das fotos do odômetro.',
    ],
  },
];

function CardIntegrante({ membro }: { membro: MembroEquipe }) {
  return (
    <Card className="flex flex-col gap-3 border-border px-[18px] py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-display text-[15px] font-bold text-text">{membro.nome}</h3>
        <Badge tone={membro.tom} className="max-w-full whitespace-normal">
          {membro.especialidade}
        </Badge>
      </div>

      <p className="m-0 flex-1 text-[13px] leading-normal text-text-secondary">
        {membro.descricao}
      </p>

      <details className="group border-t border-divider pt-2.5">
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-sm border border-border px-2.5 text-xs font-semibold text-text-strong group-open:bg-surface-alt group-open:text-primary hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          Principais contribuições
          <ChevronDown
            size={14}
            className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <ul className="mt-2.5 list-disc space-y-1 rounded-sm border border-border bg-surface-alt py-2.5 pr-3 pl-7 text-xs leading-relaxed text-text-secondary">
          {membro.entregas.map((entrega) => (
            <li key={entrega}>{entrega}</li>
          ))}
        </ul>
      </details>

      <div className="border-t border-divider pt-1.5">
        <a
          href={`https://github.com/${membro.usuarioGit}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-sm text-xs text-primary no-underline hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg
            className="shrink-0"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          github.com/{membro.usuarioGit}
          <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      </div>
    </Card>
  );
}

export default function SobreNosPage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="mb-1">
        <h1 className="m-0 mb-1 font-display text-xl font-bold tracking-tight text-text">
          Conheça o Squad 21
        </h1>
        <p className="mb-1.5 text-[11px] font-bold tracking-wider text-primary uppercase">
          Residência em Software III
        </p>
        <p className="m-0 max-w-[820px] text-[13px] leading-relaxed text-text-secondary">
          Equipe responsável pelo desenvolvimento do Sistema de Gestão de Frotas da Fundação de
          Saúde Parreiras Horta (FSPH). Atualizado em <time dateTime="2026-11-19">19/11/2026</time>.
        </p>
      </div>

      <section className="@container" aria-labelledby="integrantes-squad">
        <h2
          id="integrantes-squad"
          className="mb-3 text-[11px] font-bold tracking-wider text-text-secondary uppercase"
        >
          Integrantes
        </h2>
        <div className="grid grid-cols-1 gap-x-5 gap-y-3.5 @min-[600px]:grid-cols-2 @min-[936px]:grid-cols-3">
          {MEMBROS.map((membro) => (
            <CardIntegrante key={membro.usuarioGit} membro={membro} />
          ))}
        </div>
      </section>
    </div>
  );
}
