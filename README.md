# Sistema de Gestão de Frota e Transportes (FMS/TMS) • FSPH

Plataforma integrada de **Gestão de Frota e Gestão de Transportes (Fleet Management System & Transport Management System)** desenvolvida para a **Fundação de Saúde Parreiras Horta (FSPH)** pelo **Squad 21** no âmbito da **Residência em Software III**.

O sistema substitui controles manuais e planilhas dispersas por uma solução web centralizada, otimizando o ciclo de vida dos veículos, o despacho de viagens, a triagem de atendimentos do **Serviço de Verificação de Óbito (SVO)** e a transparência operacional da frota pública de saúde de Sergipe.

---

## 📌 Contexto e Problema de Negócio

A Fundação de Saúde Parreiras Horta coordena órgãos estratégicos da saúde em Sergipe, incluindo o **Centro de Hemoterapia de Sergipe (HEMOSE)**, o **Laboratório Central de Saúde Pública (LACEN)** e o **Serviço de Verificação de Óbito (SVO)**.

Historicamente, a operação sofria com:
- **Informações Fragmentadas**: Controles manuais e planilhas dispersas sobre viaturas, manutenções, condutores e abastecimentos;
- **Viagens Subutilizadas**: Ausência de um mapa consolidado de trajetos para agregação de passageiros e compartilhamento de rotas;
- **Risco de Inconformidade**: Falta de alertas preventivos sobre vencimento de CNH de motoristas e licenciamento (CRLV);
- **Especificidade do SVO**: Processos manuais de acolhimento de óbitos e necessidade de controle rígido de capacidade por viatura (máximo de até 4 corpos por veículo).

O **FMS/TMS FSPH** unifica toda a governança da frota administrativa e especializada em um único ecossistema digital seguro, auditável e responsivo.

---

## 🚀 Funcionalidades do Sistema

### 🏢 Frota Administrativa & Operações Gerais
- **Central de Operações (Home)**: Visão panorâmica em tempo real com atalhos de ação rápida, status das viaturas e atalhos de despacho.
- **Triagem e Análise de Solicitações**:
  - Usuários institucionais registram solicitações de viagem informando origem, destino, justificativa e horários previstos.
  - O Gestor de Frota analisa em tempo real a disponibilidade de viaturas e motoristas livres, aprovando ou recusando com justificativa auditável.
- **Despacho e Manifesto de Viagens**:
  - Geração de viagens a partir de solicitações aprovadas com associação de veículo e condutor apto.
  - Acompanhamento do ciclo de vida: *Agendada → Em Andamento (com odômetro inicial) → Concluída (com odômetro final e cálculo de KM rodado)* ou *Cancelada*.
  - Visualização de **Ticket de Viagem / Manifesto inline** para conferência e impressão.
- **Controle de Veículos e Motoristas**:
  - Cadastro de viaturas com separação entre frota Administrativa e frota SVO.
  - Registro de condutores com controle de validade e categoria da CNH.
- **Painel de Indicadores e Métricas (Dashboard)**:
  - Gráficos de eficiência, consumo de combustível, taxa de ocupação da frota e volume de viagens por período.
- **Abastecimento e Eficiência**:
  - Lançamento de abastecimentos, postos credenciados e cálculo automático de consumo médio (km/L).
- **Multas & Infrações**:
  - Vinculação de autuações ao motorista responsável e controle do saldo de pontos na CNH.
- **Agenda de Frotas**:
  - Visualização de viagens programadas por veículo, prevenindo sobreposição e conflito de recursos.

### 🚑 Módulo SVO (Serviço de Verificação de Óbito)
- **Triagem de Solicitações de Óbito**: Acolhimento e validação de solicitações de coleta pela população e unidades de saúde.
- **Ordens de Coleta**: Despacho de viatura SVO com controle rígido de lotação (capacidade estrita de até 4 corpos simultâneos).
- **Escalas e Plantões**: Alocação de ordens apenas para equipes e motoristas escalados no plantão vigente.

---

## 🛠️ Stack Tecnológica

O projeto adota uma arquitetura desacoplada **TypeScript End-to-End**:

| Camada | Tecnologia | Descrição |
|---|---|---|
| **Front-end** | React 19 + TypeScript + Vite | SPA moderna, modular, tipagem estrita, CSS puro com tokens de design e `lucide-react`. |
| **Roteamento & RBAC** | `react-router-dom` | Rotas públicas, rotas protegidas e controle de acesso baseado em perfis (Administrador, Gestores, Solicitante, Motorista). |
| **Back-end** | Node.js + TypeScript + Express | API REST estruturada em MVC (Routes, Controllers, Services, Validators Zod). |
| **Segurança & Sessão** | JWT (JSON Web Tokens) + Bcrypt | Autenticação stateless com interceptors HTTP no cliente e expiração segura. |
| **Banco de Dados** | PostgreSQL | Modelagem relacional normalizada com migrations e seeds versionados via Knex.js. |
| **Conteinerização** | Docker & Docker Compose | Ambiente padronizado para execução local do banco PostgreSQL. |
| **Automação & Qualidade**| GitHub Actions (CI/CD) + Vitest | Pipeline automatizada de linting, checagem de tipos e suíte de testes. |

---

## 📁 Estrutura do Repositório

```text
Residencia3/
├── .github/workflows/          # Pipelines de CI/CD (testes, lint e build)
├── docs/                       # Documentações técnicas e regras de negócio
│   ├── dicionario-de-dados.md  # Dicionário de dados oficial das tabelas do banco
│   ├── Documentacao_do_Squad_21.md # Documentação da Residência (RFs, RNs e RNFs)
│   ├── frontend.md             # Documento de arquitetura, contratos e roadmap do front-end
│   └── guia-de-execucao.md     # Passo a passo para rodar o ambiente completo
├── src/
│   ├── backend/                # API REST em Node.js/TypeScript
│   │   ├── database/           # Migrations e Seeds do PostgreSQL (Knex)
│   │   ├── src/
│   │   │   ├── controllers/    # Camada de controle e resposta HTTP
│   │   │   ├── middlewares/    # Autenticação JWT, autorização RBAC e logs
│   │   │   ├── routes/         # Definição das rotas e contratos da API
│   │   │   ├── services/       # Regras de negócio e persistência
│   │   │   └── validators/     # Schemas de validação Zod
│   │   └── package.json
│   └── frontend/               # Single Page Application React/TypeScript
│       ├── src/
│       │   ├── components/     # UI Design System (Button, Modal, Table, Badge, Card...)
│       │   ├── contexts/       # AuthContext (sessão e perfil ativo)
│       │   ├── pages/          # Telas do sistema (Home, Viagens, Solicitações, Sobre...)
│       │   ├── routes/         # Configuração de rotas e guards de permissão
│       │   ├── services/api/   # Cliente HTTP (fetch com interceptors) e APIs de domínio
│       │   └── types/          # Tipos TypeScript espelhando o banco e domínio
│       └── package.json
├── docker-compose.yml          # Definição do serviço PostgreSQL
└── README.md                   # Este documento
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 20 LTS ou superior) e npm
- [Docker Desktop](https://www.docker.com/) rodando na máquina
- [Git](https://git-scm.com/)

### 1. Clonar o Repositório
```bash
git clone https://github.com/Squad-21-Residencia-em-Software-III/Residencia3.git
cd Residencia3
```

### 2. Subir o Banco de Dados (Docker)
Copie as variáveis de ambiente e suba o contêiner do PostgreSQL:
```bash
# Na raiz do projeto:
cp .env.example .env
docker compose up -d
```

### 3. Configurar e Iniciar o Back-end
```bash
cd src/backend
npm install

# Rodar as migrations e os dados iniciais (seed):
npm run migrate
npm run seed

# Iniciar o servidor Express (porta 3000):
npm run dev
```

### 4. Configurar e Iniciar o Front-end
Em outro terminal:
```bash
cd src/frontend
npm install

# Criar o arquivo de variáveis de ambiente com a URL da API:
echo "VITE_API_URL=http://localhost:3000/api" > .env

# Iniciar o servidor de desenvolvimento Vite (porta 5173):
npm run dev
```

Acesse no navegador: **`http://localhost:5173/`**

---

## 👥 Perfis de Acesso para Testes

O seed inicial carrega usuários de demonstração com diferentes níveis de permissão (senha padrão: `Senha@123` ou conforme documentado no seed):

| Perfil | E-mail de Teste | Escopo de Acesso |
|---|---|---|
| **Administrador** | `admin@exemplo.com` | Acesso total ao sistema, incluindo cadastro e gestão de Usuários (`/usuarios`). |
| **Gestor de Frota** | `gestor.frota@exemplo.com` | Análise e aprovação de solicitações, despacho de viagens, veículos, motoristas e dashboard. |
| **Gestor SVO** | `gestor.svo@exemplo.com` | Gestão de ordens de coleta, atendimento a óbitos e viaturas especializadas SVO. |
| **Solicitante** | `solicitante@exemplo.com` | Registro e acompanhamento das próprias solicitações de viagem institucional. |
| **Motorista** | `motorista.frota@exemplo.com` | Acompanhamento de viagens designadas e registro de odômetro de saída e chegada. |

---

## 🗺️ Roadmap de Evolução Técnica

O planejamento detalhado das próximas entregas encontra-se documentado na **Seção 18 do [`docs/frontend.md`](file:///c:/Users/xoney/Documents/GitHub/Residencia3/docs/frontend.md#L738)**:

1. **Conexão dos Módulos Restantes à API REST**:
   - Conexão do Dashboard Executivo (`GET /api/dashboard`);
   - Gestão de Usuários e Troca de Senha (`/usuarios`);
   - Módulo de Multas & Autuações (`/multas`);
   - Lançamento de Abastecimento e Consumo Médio (`/abastecimento`);
   - Manutenções de Viaturas e Bloqueio Preventivo/Corretivo;
   - Cadastro de Motoristas com Validação de CNH (`POST /api/motoristas`).
2. **Design System & Transição do CSS**:
   - Eliminação de estilos inline remanescentes e consolidação da saída de CSS (CSS Modules / Tailwind CSS);
   - Componentização de elementos corporativos (`MetricCard`, `FilterCollapse`, `PageHeader`, `ConfirmDialog`, `EmptyState`, `DatePicker`).
3. **Módulo de Agenda Interativa (`/agenda`)**:
   - Conexão da Agenda à API de viagens, Gantt diário por viatura, visão semanal e algoritmo de prevenção visual de sobreposição (`RN04`, `RF14`).
4. **Módulo Especializado SVO**:
   - Ciclo de vida completo das Ordens de Coleta de Óbito, trava rígida de até 4 corpos por viatura (`RN11`) e gestão de escalas de plantão.
5. **Alertas Preventivos, Auditoria, Anexos & Relatórios**:
   - Alerta antecipado de vencimento de CNH (30 dias) e CRLV;
   - Upload de documentos comprobatórios via `documentoRoutes.ts`;
   - Trilha de auditoria para ações críticas e exportação de relatórios em PDF e Excel/CSV.
6. **Conectividade Resiliente (PWA) & Testes**:
   - Suporte offline com IndexedDB para viagens em regiões de baixa conectividade no interior de Sergipe;
   - Cobertura de testes unitários e de integração no front-end (Vitest + Testing Library).

---
