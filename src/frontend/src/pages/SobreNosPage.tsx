import { useState } from 'react'
import { Card, Badge } from '../components/ui'
import type { BadgeTone } from '../components/ui'

type AreaId = 'FRONTEND' | 'BANCO' | 'BACKEND' | 'DEVOPS'

interface ItemEntrega {
  titulo: string
  detalhe: string
}

interface MembroEquipe {
  id: string
  nome: string
  usuarioGit: string
  githubUrl: string
  area: AreaId
  areaRotulo: string
  descricao: string
  entregas: ItemEntrega[]
}

const MEMBROS: MembroEquipe[] = [
  // ── Frontend (3) ──
  {
    id: 'yarllei',
    nome: 'Yarllei Lima',
    usuarioGit: 'Yarllei01',
    githubUrl: 'https://github.com/Yarllei01',
    area: 'FRONTEND',
    areaRotulo: 'Frontend',
    descricao: 'Liderança de frontend e responsável pela identidade visual do projeto e arquitetura global da interface.',
    entregas: [
      {
        titulo: 'Design de Interface, Layout & Componentes',
        detalhe: 'Criação da identidade visual, layout geral do sistema e biblioteca de componentes reutilizáveis, incluindo botões, modais, tabelas e filtros dinâmicos.',
      },
      {
        titulo: 'Desenvolvimento de Telas do Sistema',
        detalhe: 'Construção da Tela Inicial de Operações, Agenda da Frota (visualizações por dia, semana e mês), Gestão de Solicitações, Viagens com Ticket de Operação, Controle de Abastecimento e Painel de Indicadores.',
      },
      {
        titulo: 'Arquitetura & Gestão',
        detalhe: 'Estruturação inicial base do frontend da aplicação e coordenação do ritmo das entregas do grupo de frontend',
      },
      {
        titulo: 'Responsividade & Uso no Celular',
        detalhe: 'Adaptação em andamento de telas e formulários para celulares e tablets, permitindo que motoristas e gestores usem o sistema com facilidade na rotina de trânsito.',
      },
    ],
  },
  {
    id: 'vinicius',
    nome: 'Vinícius Reis',
    usuarioGit: 'Loboock',
    githubUrl: 'https://github.com/Loboock',
    area: 'FRONTEND',
    areaRotulo: 'Frontend',
    descricao: 'Integração de serviços, gestão de manutenções mecânicas e status da frota.',
    entregas: [
      {
        titulo: 'Integração de Telas com Serviços',
        detalhe: 'Conexão e consumo em tempo real dos serviços de Solicitações, Viagens, Veículos e Motoristas com a base de dados do sistema.',
      },
      {
        titulo: 'Formulários Operacionais & Cadastros',
        detalhe: 'Desenvolvimento e validação de todos os modais e formulários: cadastros de veículos e condutores, ordens de manutenção mecânica e fluxo de início e término de viagens.',
      },
      {
        titulo: 'Gestão de Manutenções da Frota',
        detalhe: 'Painel para acompanhamento de ordens de serviço mecânicas preventivas e corretivas, monitorando a disponibilidade e conservação dos veículos.',
      },
      {
        titulo: 'Persistência & Agilidade de Dados',
        detalhe: 'Estruturação de retenção segura de dados no navegador para garantir continuidade e rapidez no preenchimento dos formulários.',
      },
    ],
  },
  {
    id: 'kaylan',
    nome: 'Arthur Kaylan',
    usuarioGit: 'kaylan-sx',
    githubUrl: 'https://github.com/kaylan-sx',
    area: 'FRONTEND',
    areaRotulo: 'Frontend',
    descricao: 'Desenvolvimento do módulo de infrações de trânsito, painel de gestores e autenticação.',
    entregas: [
      {
        titulo: 'Módulo de Multas & Autuações',
        detalhe: 'Telas de consulta e formulário assistido para lançamento de autuações vinculadas aos veículos e condutores, incluindo controle de pontuação na CNH e órgãos emissores.',
      },
      {
        titulo: 'Painel de Gestores por Unidade',
        detalhe: 'Interface dedicada para visualização e distribuição de gestores responsáveis pelos setores de Hemose, Lacen e SVO.',
      },
      {
        titulo: 'Acesso & Autenticação',
        detalhe: 'Construção da tela de entrada do sistema e padronização visual das janelas de acesso e login dos usuários.',
      },
    ],
  },

  // ── Backend (3) ──
  {
    id: 'gabriel-alves',
    nome: 'Gabriel Alves',
    usuarioGit: 'bieldb',
    githubUrl: 'https://github.com/bieldb',
    area: 'BACKEND',
    areaRotulo: 'Backend',
    descricao: 'Liderança de backend, atuando em serviços do sistema, apoio à modelagem de dados e infraestrutura.',
    entregas: [
      {
        titulo: 'Painel de Indicadores & Métricas',
        detalhe: 'Construção dos serviços analíticos que consolidam os indicadores da frota em tempo real: pedidos pendentes, viagens ativas, disponibilidade por setor e alertas preventivos.',
      },
      {
        titulo: 'Isolamento Operacional por Unidade',
        detalhe: 'Regras de negócio que asseguram a privacidade de dados, permitindo que cada gestor visualize e aprove apenas as viagens da sua respectiva unidade (Hemose, Lacen e SVO).',
      },
      {
        titulo: 'Controle de Acesso & Gestão de Usuários',
        detalhe: 'Mecanismos seguros de autenticação e endpoints para gerenciamento de servidores, administradores e motoristas conforme seus papéis no sistema.',
      },
      {
        titulo: 'Arquitetura de Serviços do Sistema',
        detalhe: 'Estruturação inicial da plataforma, definição de padrões de comunicação entre as regras de negócio e apoio à infraestrutura em nuvem.',
      },
    ],
  },
  {
    id: 'joao',
    nome: 'João Guilherme',
    usuarioGit: 'JGui133',
    githubUrl: 'https://github.com/JGui133',
    area: 'BACKEND',
    areaRotulo: 'Backend',
    descricao: 'Regras de negócio de transporte, motor de conflito e gestão de combustível.',
    entregas: [
      {
        titulo: 'Gestão de Solicitações & Conflito de Agenda',
        detalhe: 'Serviços para tramitação, aprovação e recusa justificada de pedidos, com validação inteligente que impede a sobreposição de horários entre veículos e motoristas.',
      },
      {
        titulo: 'Controle de Abastecimentos',
        detalhe: 'Regras de negócio para registro de abastecimentos com cálculo automático de preço médio por litro e histórico de consumo de combustível.',
      },
      {
        titulo: 'Tipos de Frota & Atendimento SVO',
        detalhe: 'Segregação entre a frota administrativa e os veículos operacionais do Serviço de Verificação de Óbito, aplicando prioridade para atendimentos emergenciais.',
      },
    ],
  },
  {
    id: 'leonardo',
    nome: 'Leonardo H.',
    usuarioGit: 'Cerolazkto',
    githubUrl: 'https://github.com/Cerolazkto',
    area: 'BACKEND',
    areaRotulo: 'Backend',
    descricao: 'Conformidade regulatória da frota, controle de habilitação e autuações.',
    entregas: [
      {
        titulo: 'Alertas de Regularidade da Frota',
        detalhe: 'Monitoramento contínuo de prazos de documentação e bloqueio preventivo de condutores com habilitação vencida no agendamento de transportes.',
      },
      {
        titulo: 'Vinculação de Multas & Pontuação Legal',
        detalhe: 'Associação direta entre infrações de trânsito, condutores responsáveis e prontuário do veículo, com controle preventivo de pontos acumulados na CNH.',
      },
    ],
  },

  // ── Dados & Infraestrutura (Resto - 2) ──
  {
    id: 'gabriel-arruda',
    nome: 'Gabriel Arruda Cordeiro',
    usuarioGit: 'GArrudaC',
    githubUrl: 'https://github.com/GArrudaC',
    area: 'BANCO',
    areaRotulo: 'Banco de Dados',
    descricao: 'Responsável pelo banco de dados e infraestrutura, atuando também no suporte ao backend.',
    entregas: [
      {
        titulo: 'Modelagem de Banco de Dados',
        detalhe: 'Planejamento e estruturação de tabelas, chaves de relacionamento e organização de entidades para suportar todas as operações do sistema.',
      },
      {
        titulo: 'Regras de Integridade & Dicionário de Dados',
        detalhe: 'Implementação de travas estruturais no banco para assegurar a consistência dos registros de toda a frota, além da criação e manutenção contínua do dicionário de dados da fundação.',
      },
      {
        titulo: 'Infraestrutura & Banco em Nuvem',
        detalhe: 'Automação para implantação do banco, carga inicial de dados institucionais e configuração segura para operação em nuvem.',
      },
      {
        titulo: 'Suporte ao Backend & Validações',
        detalhe: 'Desenvolvimento de regras operacionais no servidor, validação rigorosa de dados de entrada e histórico de auditoria das ações do sistema.',
      },
    ],
  },
  {
    id: 'matheus',
    nome: 'Matheus Andrade',
    usuarioGit: 'Theseus04',
    githubUrl: 'https://github.com/Theseus04',
    area: 'DEVOPS',
    areaRotulo: 'DevOps & QA',
    descricao: 'Líder e responsável por DevOps & QA, automação de deploys e testes de integração.',
    entregas: [
      {
        titulo: 'Esteira de Automação & Publicação',
        detalhe: 'Automação contínua para compilação, validação de integridade do código e publicação automática do sistema em ambiente de homologação.',
      },
      {
        titulo: 'Suíte de Testes Automatizados',
        detalhe: 'Mais de 130 testes automatizados cobrindo rotas, controladores e serviços para garantir que as operações ocorram sem falhas.',
      },
      {
        titulo: 'Prevenção de Falhas & Qualidade',
        detalhe: 'Políticas rigorosas de homologação exigindo 100% de sucesso nos testes antes de liberar novas versões para a equipe.',
      },
    ],
  },
]

export default function SobreNosPage() {
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  const toggleExpandido = (id: string) => {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const renderCard = (membro: MembroEquipe) => {
    const toneBadge: BadgeTone =
      membro.area === 'FRONTEND'
        ? 'info'
        : membro.area === 'BACKEND'
        ? 'purple'
        : membro.area === 'BANCO'
        ? 'warning'
        : 'neutral'

    const aberto = !!expandidos[membro.id]

    return (
      <Card
        key={membro.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '16px 18px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          gap: '12px',
          transition: 'all 0.2s ease',
        }}
      >
        <div>
          {/* Linha 1: Nome + Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
            <h3
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-display)',
                margin: 0,
              }}
            >
              {membro.nome}
            </h3>
            <Badge tone={toneBadge}>{membro.areaRotulo}</Badge>
          </div>

          {/* Linha 2: Síntese de atuação */}
          <p
            style={{
              fontSize: '12.5px',
              lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
              margin: '0 0 10px 0',
            }}
          >
            {membro.descricao}
          </p>

          {/* Linha 3: Dropdown Acordeon de Contribuições com Transição Suave */}
          <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: '10px' }}>
            <button
              type="button"
              onClick={() => toggleExpandido(membro.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: aberto ? 'var(--color-surface-alt)' : 'transparent',
                color: aberto ? 'var(--color-primary)' : 'var(--color-text-strong)',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <span>Principais contribuições ({membro.entregas.length})</span>
              <span
                style={{
                  fontSize: '10px',
                  display: 'inline-block',
                  transform: aberto ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                ▼
              </span>
            </button>

            <div
              style={{
                display: 'grid',
                gridTemplateRows: aberto ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <div
                  style={{
                    marginTop: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '10px 12px',
                    background: 'var(--color-surface-alt)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-subtle, var(--color-border))',
                  }}
                >
                  {membro.entregas.map((item) => (
                    <div
                      key={item.titulo}
                      style={{
                        fontSize: '11.5px',
                        lineHeight: 1.45,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <strong style={{ color: 'var(--color-text)', display: 'block', marginBottom: '2px' }}>
                        • {item.titulo}
                      </strong>
                      <span style={{ display: 'block', paddingLeft: '8px' }}>{item.detalhe}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Linha 4: Link para o GitHub do autor */}
        <div
          style={{
            paddingTop: '6px',
            borderTop: '1px solid var(--color-divider)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
          }}
        >
          <a
            href={membro.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11.5px',
              color: 'var(--color-text-muted)',
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-primary)'
              e.currentTarget.style.textDecoration = 'underline'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-muted)'
              e.currentTarget.style.textDecoration = 'none'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>github.com/{membro.usuarioGit}</span>
            <span style={{ fontSize: '10px' }}>↗</span>
          </a>
        </div>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: '32px' }}>
      {/* ── Header Institucional (estilo Home) ── */}
      <div style={{ marginBottom: 'var(--space-1)' }}>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--color-text)',
            fontFamily: 'var(--font-display)',
            margin: '0 0 var(--space-1)',
            letterSpacing: '-0.02em',
          }}
        >
          Conheça o Squad 21
        </h1>

        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--color-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            display: 'block',
            marginBottom: '6px',
          }}
        >
          Residência em Software III
        </span>

        <p
          style={{
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--color-text-secondary)',
            margin: 0,
            maxWidth: '820px',
            textWrap: 'pretty',
          }}
        >
          Equipe responsável pelo planejamento, design de interface, modelagem de banco de dados, arquitetura, desenvolvimento e controle de qualidade da solução desenvolvida para a Fundação de Saúde Parreiras Horta (FSPH). Última atualização dessa aba: 07/11/2026.
        </p>
      </div>

      {/* ── Seção de Integrantes ── */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--color-text-muted)',
            marginBottom: 'var(--space-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Integrantes
        </div>

        {/* ── Visualização em 3 Colunas Verticais por Especialidade ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          {/* Coluna 1: Só Frontend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {MEMBROS.filter((m) => m.area === 'FRONTEND').map((membro) => renderCard(membro))}
          </div>

          {/* Coluna 2: Só Backend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {MEMBROS.filter((m) => m.area === 'BACKEND').map((membro) => renderCard(membro))}
          </div>

          {/* Coluna 3: Banco de Dados & Infra (Resto) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {MEMBROS.filter((m) => m.area === 'BANCO' || m.area === 'DEVOPS').map((membro) => renderCard(membro))}
          </div>
        </div>
      </div>
    </div>
  )
}
