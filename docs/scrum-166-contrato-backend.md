# SCRUM-166: o que o backend e o banco precisam entregar para o front

Este documento descreve os contratos da SCRUM-166: consultas próprias, ordens pendentes, agenda temporal, alertas e liberação de coletas.

As integrações são controladas em `recursosBackend.ts`. A agenda SVO fica desativada por padrão; `VITE_AGENDA_SVO_ATIVA=true` só pode ser configurado no build após a atualização e a validação do banco pela equipe responsável.

Os contratos de agendamento descritos abaixo correspondem à implementação desta branch e exigem a migration de estado e alertas revisada pela frente DB.

Matriz de acesso usada em todo o documento (HU SCRUM-166):

| Perfil | Administrativo | SVO |
|---|---|---|
| ADMINISTRADOR | Gestão completa | Gestão completa |
| GESTOR_FROTA | Gestão completa | Nenhum acesso de gestão |
| GESTOR_SVO | Só cria e acompanha os **próprios** pedidos e viagens; veículos: só modelo, placa, status e capacidade | Gestão completa |
| SOLICITANTE | Próprios pedidos | Nenhum acesso |
| MOTORISTA_FROTA / MOTORISTA_SVO | Só o que lhe é atribuído, na própria frota | Só o que lhe é atribuído, na própria frota |

---

## 1. Recusa SVO com justificativa (SCRUM-178)

**Interruptor:** `recusaSvo`. **Serviço do front:** `solicitacoesSvoApi.recusar`.

**Hoje:** `PATCH /solicitacoes-svo/:id/recusar` está implementado na develop e a recusa foi habilitada no front. A coluna `solicitacoes_svo.motivo_recusa` (TEXT) já existe (migration `20261111140211`), então **não precisa de migration**.

**O que o front chama:**

```http
PATCH /api/solicitacoes-svo/:id/recusar
Content-Type: application/json

{ "motivo_recusa": "Óbito fora da área de cobertura." }
```

**Regras esperadas no back:**
- **Quem pode:** só ADMINISTRADOR e GESTOR_SVO; os demais recebem 403.
- **Motivo:** `motivo_recusa` com `trim()`, de 1 a **500** caracteres. A recusa administrativa tem limite próprio de 200 caracteres. Faltando, vazio ou só com espaços: 400.
- **Status:** só a partir de `EM_TRIAGEM`, que passa a `RECUSADA`. Em CONFIRMADA, EM_ANDAMENTO, CONCLUIDA, CANCELADA ou RECUSADA: 409 com mensagem clara.
- **Concorrência:** transação com `FOR UPDATE`. Recusar e confirmar ao mesmo tempo não pode gerar ordem nem regravar o status.
- **Ordem de coleta:** a recusa nunca gera ordem.
- **Auditoria:** gravar autor, data e motivo.

**Resposta:** qualquer 2xx serve. Depois do sucesso, o front recarrega `GET /solicitacoes-svo/:id`. Esse GET precisa **devolver `motivo_recusa`** (o front exibe o campo quando o status é `RECUSADA`).

---

## 2. Viagens administrativas do próprio Gestor SVO (SCRUM-179)

**Interruptor:** `minhasViagensAdministrativas`. **Serviço do front:** `viagensApi.listarMinhasAdministrativas`.

**Hoje:** para o GESTOR_SVO, `GET /viagens` devolve só ordens SVO. A aba Administrativo usa a consulta própria paginada descrita abaixo.

**O que o front chama:**

```http
GET /api/viagens/minhas
```

**Regras esperadas:**
- Devolve só as viagens **ADMINISTRATIVA** cujas solicitações têm `solicitacoes_viagem.solicitante_id = id do JWT`. O filtro é feito no SQL, nunca depois de buscar tudo.
- **Formato:** objeto paginado `{ dados, paginacao }` com DTO reduzido, incluindo identificadores, trajeto, finalidade, horários e status, sem nome do motorista nem quilometragem. A interface percorre as páginas e apresenta apenas os campos recebidos.
- **Ações:** nessa visão o front não mostra iniciar, finalizar nem cancelar. Mesmo assim, o back deve barrar essas ações do GESTOR_SVO em viagens administrativas (o `garantirAcesso` atual já faz isso).
- **Detalhe por ID:** consultar diretamente uma viagem de outra pessoa deve devolver 403 ou 404 (sem IDOR/BOLA).
- **Pedidos:** o GESTOR_SVO continua usando `GET /solicitacoes-viagem/minhas`, que o front já usa no PR #115.

---

## 3. Dados de veículos por perfil e frota (SCRUM-180)

Esta parte **não tem interruptor**: o front já se comporta assim. Falta o back garantir a regra, porque hoje ela é só visual.

**O que o front já faz:**
- Na aba da **outra frota**, o gestor vê só a consulta básica (placa, modelo, status e capacidade). A coluna de km some.
- O drawer **não chama** `/manutencoes`, `/abastecimentos` nem `/multas` de veículos da outra frota.
- Os botões de cadastrar e editar só aparecem na frota do próprio perfil (o Administrador vê nas duas).

**O que o back precisa garantir:**
- **Listagem:** em `GET /veiculos`, devolver ao GESTOR_SVO os veículos **ADMINISTRATIVA** só com DTO mínimo: `id`, `placa`, `modelo`, `tipo_frota`, `status`, `capacidade_maxima`. Sem `km_atual` nem dados de custo. O Gestor de Frota não deve ter aba de gestão SVO.
- **Históricos:** endpoints de histórico, manutenção, abastecimento e multa de veículo da outra frota devolvem 403.
- **Escrita:** em `POST` e `PUT /veiculos`, o GESTOR_SVO só grava `tipo_frota = 'SVO'` e o GESTOR_FROTA só `'ADMINISTRATIVA'`.
- **Troca de frota:** no `PUT`, validar o tipo do registro já existente. Mudar `tipo_frota` para contornar a permissão deve dar 403.
- **Sobreposição:** conferir com o PR #124 (SCRUM-153, autorização por registro), que pode já cobrir parte disso.

---

## 4. Duas capacidades no veículo SVO (SCRUM-175 banco + SCRUM-181 back)

**Interruptor:** `lotacaoCabine`. **Campo no front:** `Veiculo.lotacao_cabine`.

**Banco (SCRUM-175):** nova coluna `veiculos.lotacao_cabine INTEGER NULL`, com `CHECK (lotacao_cabine IS NULL OR lotacao_cabine >= 1)`.
- Veículos já existentes ficam com `NULL`: não inventar lotação. O front exibe "Não informada".

**Back (SCRUM-181):**
- **Cadastro e edição SVO:**
  - `capacidade_maxima` = **corpos**, inteiro de 1 a 4 (regra que já existe);
  - `lotacao_cabine` = **pessoas na cabine, motorista incluído**, inteiro ≥ 1 e obrigatório no cadastro SVO;
  - sem limite universal de 2 ou 3: o limite vem do documento do veículo.
- **Veículo administrativo:** `capacidade_maxima` continua sendo passageiros; o back ignora ou rejeita `lotacao_cabine`.
- **Respostas:** devolver `lotacao_cabine` em `GET /veiculos` e `GET /veiculos/:id`.
- **Redução de capacidade:** bloquear a redução de `capacidade_maxima` abaixo da ocupação ativa (soma de `capacidade_utilizada` das ordens ALOCADA ou EM_DESLOCAMENTO), com 409 e mensagem clara. Fazer em transação com lock, para não haver corrida com uma alocação.

**O que o front envia** (`POST /veiculos` e `PUT /veiculos/:id`), com o interruptor ligado e frota SVO:

```json
{ "placa": "SVO1A23", "modelo": "Rabecão", "tipo_frota": "SVO", "capacidade_maxima": 4, "km_atual": 0, "lotacao_cabine": 3 }
```

---

## 5. Ordens pendentes e agendamento por período (SCRUM-176 banco + SCRUM-182 back)

Há dois interruptores: `ordensPendentesSvo` (listagem) e `agendamentoTemporalSvo` (agendamento). Os dois ficam no serviço `viagensApi`.

### 5.1 Listar ordens aguardando alocação

**Comportamento:**
- `GET /viagens` exclui as ordens `AGUARDANDO_ALOCACAO` (`viagemModel`: `WHERE o.status <> 'AGUARDANDO_ALOCACAO'`).
- O front usa a listagem paginada definitiva. O caminho alternativo mantido no código verifica detalhes das solicitações confirmadas e apresenta erro explícito caso ultrapasse o limite de 100 ou uma consulta falhe.

**O que o front chama:**

```http
GET /api/viagens/ordens-svo/pendentes?pagina=1&limite=100
```

```json
{
  "dados": [
    {
      "ordem_id": 40,
      "solicitacao_id": 31,
      "local_ocorrencia": "Av. Beira Mar, 500",
      "material_sensivel": true,
      "confirmado_em": "2026-11-16T10:00:00.000Z"
    }
  ],
  "paginacao": { "pagina": 1, "limite": 100, "total": 1, "totalPaginas": 1 }
}
```

- **Quem pode:** só ADMINISTRADOR e GESTOR_SVO.
- **Ordenação:** da confirmação mais antiga para a mais nova.
- **Campos nulos:** não exigir veículo nem motorista, porque a ordem ainda não tem recursos.

### 5.2 Agendar a coleta com período

**Banco (SCRUM-176):**
- Em `ordens_svo`: colunas `inicio_previsto TIMESTAMPTZ` e `fim_previsto TIMESTAMPTZ`, com `CHECK (fim_previsto > inicio_previsto)`.
- Manter `data_hora_chamado` separado: é a hora do chamado, não da coleta.
- Prever onde registrar a auditoria da exceção de intervalo (autor, recursos e horários).

**O que o front envia:** continua sendo `POST /api/viagens`, que hoje já aloca a ordem SVO via `alocarOrdemSvo`.

```json
{
  "tipo_operacao": "SVO",
  "solicitacao_id": 31,
  "veiculo_id": 2,
  "motorista_id": 5,
  "inicio_previsto": "2026-11-17T17:00:00.000Z",
  "fim_previsto": "2026-11-17T19:00:00.000Z"
}
```

`equipe_id` é opcional no modal de coleta e usa a consulta de disponibilidade de equipes integrada pelo PR #117.

**Respostas esperadas:**

| Situação | Status | Corpo |
|---|---|---|
| Agendado | 2xx | A viagem ou ordem (o front recarrega as listas) |
| Folga de **0 a menos de 20 min** para outra reserva do mesmo veículo, motorista ou equipe | 409 (ou 428) | `{ "erro": "...", "codigo": "CONFIRMACAO_INTERVALO_REDUZIDO", "contexto": { "conflitos": [ { "recurso": "VEICULO", "descricao": "Rabecão (SVO2B22)", "inicio": "ISO", "fim": "ISO", "intervalo_minutos": 10 } ] } }` |
| **Sobreposição real** de horários | 409 | `{ "erro": "O veículo já está reservado nesse período.", "codigo": "CONFLITO_AGENDA" }` (qualquer código diferente do de cima) |
| Datas inválidas (fim ≤ início, início no passado) | 400 | `{ "erro", "detalhes" }` |
| Perfil sem permissão | 403 | |

**A segunda confirmação:**
- O aviso devolve `contexto.token_confirmacao`. Depois da ciência do gestor, o front reenvia **o mesmo corpo** com `"confirmar_intervalo_reduzido": true` e o token recebido.
- O token assinado vincula ator, ordem, recursos, horários e conflitos e expira em cinco minutos. O servidor reconsulta e revalida tudo sob lock. Um token de outro ator, expirado ou com reservas alteradas exige novo aviso. A confirmação nunca autoriza sobreposição.

**Regras do agendamento (DVP e HU):**
- **Intervalo:** usar intervalos `[inicio, fim)`.
- **Recursos verificados:** veículo, motorista e equipe (se for informada), incluindo reservas futuras.
- **Também validar:** CNH, veículo em manutenção e capacidade de corpos.
- A ocupação operacional não soma reservas de períodos futuros; uma coleta em deslocamento continua ocupando o veículo mesmo após o término previsto. Ao reduzir a capacidade, o servidor considera o maior compromisso simultâneo dos períodos e a ocupação ativa, sob lock do veículo.
- **Equipe:** opcional; só reservar o que for informado.
- **Fuso:** o front envia ISO em UTC, a partir do horário local do navegador (America/Maceio).
- **Auditoria:** registrar autor, horários e recursos da exceção de intervalo curto.

### 5.3 Atrasos e liberação da próxima coleta (SCRUM-183)

As estruturas `ordens_svo.liberada_em` e `alertas_atraso_svo` são dependências a implementar pela frente DB, descritas em `scrum-166-mensagem-gabriel.md`. Esta branch não contém migration para essas estruturas. Sem elas, a listagem compatível permanece acessível e operações dependentes respondem com erro de indisponibilidade; não habilitar a agenda.

Uma ordem temporal continua `ALOCADA` até a saída real. `liberada_em = null` significa que ainda não foi liberada para iniciar; uma data indica liberação. A fila é reavaliada na alocação, no reagendamento, no cancelamento, na consulta de alertas e na conclusão. A prioridade é `inicio_previsto`, depois ID; a liberação verifica veículo, motorista, CNH, equipe e integrantes designados. A fila mantém os recursos ocupados em `EM_DESLOCAMENTO` e `NO_LOCAL` até a conclusão efetiva. O planejamento pode reservar um horário posterior ao fim previsto se a coleta ainda estiver no prazo. Se o fim previsto passar com a coleta em curso, o conflito de atraso também bloqueia novas reservas até a conclusão. A liberação preserva quilometragem, horário de saída e status da ordem.

O lock transacional PostgreSQL da agenda serializa agendamentos e transições SVO; as linhas de veículo, motorista, equipe e escala são bloqueadas ao validar. Alertas de atraso são criados ou reabertos sem duplicidade durante a reavaliação, e resolvidos após conclusão ou reprogramação. A consulta autenticada e paginada é `GET /api/viagens/ordens-svo/alertas?pagina=1&limite=100`, acessível a Administrador e Gestor SVO associado. A resposta usa `{ dados, paginacao }`. O frontend consulta ao carregar a aba e mostra os alertas, sem polling contínuo.

`POST /api/viagens/ordens-svo/:id/reprogramar` aceita o mesmo corpo SVO da alocação, exige a solicitação da própria ordem e somente aceita ordem `ALOCADA`. Usa os mesmos locks, verificações e confirmação de intervalo; registra autor, recursos e horários e reavalia a fila. Perfis sem gestão SVO recebem 403.

---

## 6. Já resolvido em PR aberto

- **SCRUM-177**, recusa administrativa obrigatória (PR #122, integrado): o contrato bate com o front (`motivo` de 1 a 200 caracteres; GESTOR_SVO sem análise). O front já valida o mesmo limite.

## 7. Checklist para ligar cada interruptor

### Consulta própria administrativa

`GET /api/viagens/minhas?pagina=1&limite=20` é restrito a GESTOR_SVO associado. O servidor usa o ID do JWT no vínculo `viagens_frota.solicitacao_id → solicitacoes_viagem.solicitante_id`, antes de ordenar e paginar. A resposta contém `dados` e `paginacao` (pagina, limite, total, totalPaginas). O DTO reduzido não contém dados de motorista, veículo, custos ou quilometragem. Parâmetros desconhecidos são rejeitados. O frontend consome as páginas e mostra detalhes reduzidos. A consulta de solicitações próprias também restringe os campos para esse perfil. O isolamento entre dois gestores e a tentativa de acesso por ID de terceiro foram verificados em PostgreSQL isolado.

### Listagem de ordens pendentes

`GET /api/viagens/ordens-svo/pendentes?pagina=1&limite=20` é restrito a Administrador e Gestor SVO associado. Retorna ordens em `AGUARDANDO_ALOCACAO` ligadas a solicitações confirmadas, ordenadas por confirmação e ID, com identificadores distintos e recursos da ordem. O frontend consome as páginas. A confirmação idempotente e a paginação foram verificadas em PostgreSQL isolado. O agendamento usa a rota descrita no item 5.2.

Antes da implantação, validar a migration pela frente DB, executar o cenário de cada perfil no ambiente de homologação e rodar os testes de backend e frontend. A alteração de interface e API deve seguir a migration na mesma entrega coordenada.

## 8. Estado da integração e roteiro de homologação

A develop contém consultas próprias, ordens pendentes, agenda temporal e fila de atrasos. As migrations da agenda e as de fila, estados e designações integram o repositório. A frente DB deve confirmar sua aplicação no ambiente de destino. O [guia de ativação](operacao-odometro-e-agenda-svo.md) descreve a configuração do frontend e a homologação autenticada.

Para demonstrar em ambiente autorizado, registrar evidência, resultado observado e conclusão em cada passo:

1. Administrador abre Solicitações, alterna as abas e usa um link direto. Esperado: Administrativo inicial, SVO autorizado, histórico e filtros independentes. Observado: pendente de homologação.
2. Gestor SVO associado abre Solicitações e registra uma chamada interna. Esperado: SVO inicial, ID retornado e chamada em triagem; confirmação gera uma única ordem e recusa exige justificativa. Observado: pendente de homologação.
3. Gestor de Frota e Solicitante tentam `?aba=svo` e `/triagem-svo`. Esperado: sem acesso à triagem; testar também 401/403 e IDs de terceiros na API. Observado: pendente de homologação.
4. Gestor SVO acessa Administrativo e veículos. Esperado: apenas solicitações e viagens próprias, sem gestão administrativa e sem campos sensíveis. Observado: isolamento de dois usuários verificado no PostgreSQL isolado; homologação do ambiente da equipe pendente.
5. Testar 0, 10, 19, 20 e 30 minutos, sobreposição, todos os recursos, concorrência e fuso America/Maceio; testar atraso, conclusão real e prioridade. Esperado: conflito bloqueado, exceção curta revalidada, recursos ocupados até conclusão e nenhuma saída fictícia. Observado: regras de intervalo em testes unitários; concorrência de reserva, 10/20 minutos, atraso e conclusão simultânea em PostgreSQL isolado.

Para repetir a suíte de banco, crie e migre **somente** um banco descartável local chamado `fsph_scrum166_teste`, escutando em `127.0.0.1:55432`. Configure as variáveis `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, credenciais locais, `POSTGRES_SSL=false`, `JWT_SECRET` de teste e `SCRUM166_POSTGRES_TESTS=1`, depois execute `npx vitest run src/tests/agendaSvoPostgres.test.ts`. Em uma porta local alternativa, configure `POSTGRES_SVO_TEST_PORT` com o mesmo valor de `POSTGRES_PORT`. O teste verifica host, porta e nome do banco antes de inserir dados; não deve ser executado apontando para Neon ou banco compartilhado.

Testes simulados não substituem testes autenticados de API, banco ou interface de homologação. Revisão independente de QA e aprovação de merge permanecem necessárias.
