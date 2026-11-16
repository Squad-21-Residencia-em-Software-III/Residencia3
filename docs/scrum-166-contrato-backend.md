# SCRUM-166: o que o backend e o banco precisam entregar para o front

Este documento acompanha o PR do front das subtarefas **SCRUM-170, 171, 172, 173 e 174**. O front já está pronto. Cada parte que depende do backend está desligada em [`src/frontend/src/config/recursosBackend.ts`](../src/frontend/src/config/recursosBackend.ts).

**Como ligar:** quando o PR do back de um item for aprovado, basta mudar o valor correspondente para `true`. Com o item desligado, a tela usa só a API atual e não envia campos que o servidor ignoraria.

Os nomes de rotas e campos abaixo são **propostas** do front. Se o back preferir outros nomes, a troca fica em um único serviço do front (indicado em cada item). Combine antes de implementar.

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

**Hoje:** só existe `PATCH /solicitacoes-svo/:id/confirmar`. A coluna `solicitacoes_svo.motivo_recusa` (TEXT) já existe (migration `20261111140211`), então **não precisa de migration**.

**O que o front chama:**

```http
PATCH /api/solicitacoes-svo/:id/recusar
Content-Type: application/json

{ "motivo_recusa": "Óbito fora da área de cobertura." }
```

**Regras esperadas no back:**
- **Quem pode:** só ADMINISTRADOR e GESTOR_SVO; os demais recebem 403.
- **Motivo:** `motivo_recusa` com `trim()`, de 1 a **200** caracteres (mesmo limite da recusa administrativa do PR #122). Faltando, vazio ou só com espaços: 400.
- **Status:** só a partir de `EM_TRIAGEM`, que passa a `RECUSADA`. Em CONFIRMADA, EM_ANDAMENTO, CONCLUIDA, CANCELADA ou RECUSADA: 409 com mensagem clara.
- **Concorrência:** transação com `FOR UPDATE`. Recusar e confirmar ao mesmo tempo não pode gerar ordem nem regravar o status.
- **Ordem de coleta:** a recusa nunca gera ordem.
- **Auditoria:** gravar autor, data e motivo.

**Resposta:** qualquer 2xx serve. Depois do sucesso, o front recarrega `GET /solicitacoes-svo/:id`. Esse GET precisa **devolver `motivo_recusa`** (o front exibe o campo quando o status é `RECUSADA`).

---

## 2. Viagens administrativas do próprio Gestor SVO (SCRUM-179)

**Interruptor:** `minhasViagensAdministrativas`. **Serviço do front:** `viagensApi.listarMinhasAdministrativas`.

**Hoje:** para o GESTOR_SVO, `GET /viagens` devolve só ordens SVO (`TIPOS_POR_PERFIL`), então a aba Administrativo fica escondida para ele.

**O que o front chama:**

```http
GET /api/viagens/minhas
```

**Regras esperadas:**
- Devolve só as viagens **ADMINISTRATIVA** cujas solicitações têm `solicitacoes_viagem.solicitante_id = id do JWT`. O filtro é feito no SQL, nunca depois de buscar tudo.
- **Formato:** o mesmo de `GET /viagens` (`Viagem[]`, com `tipo_operacao: 'ADMINISTRATIVA'`). Se o DTO for reduzido, manter pelo menos os campos que a tabela usa: `id`, `tipo_operacao`, `origem`, `destino`, `inicio_previsto`, `data_hora_efetiva_saida`, `data_hora_efetiva_chegada`, `veiculo_modelo`, `veiculo_placa`, `motorista_nome`, `km_inicial`, `km_final`, `status`.
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
- **Listagem:** em `GET /veiculos`, devolver ao GESTOR_SVO os veículos **ADMINISTRATIVA** só com DTO mínimo: `id`, `placa`, `modelo`, `tipo_frota`, `status`, `capacidade_maxima`. Sem `km_atual` nem dados de custo. A mesma regra vale para o GESTOR_FROTA vendo veículos SVO, se a equipe confirmar.
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

**Hoje:**
- `GET /viagens` exclui as ordens `AGUARDANDO_ALOCACAO` (`viagemModel`: `WHERE o.status <> 'AGUARDANDO_ALOCACAO'`).
- Por isso o front monta a lista de pendentes a partir de `GET /solicitacoes-svo?status=CONFIRMADA`. Cada solicitação confirmada tem uma ordem aguardando alocação, mas nessa listagem o id da ordem não vem.

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

`equipe_id` (opcional) entra quando o PR #117 for integrado ao modal novo.

**Respostas esperadas:**

| Situação | Status | Corpo |
|---|---|---|
| Agendado | 2xx | A viagem ou ordem (o front recarrega as listas) |
| Folga de **0 a menos de 20 min** para outra reserva do mesmo veículo, motorista ou equipe | 409 (ou 428) | `{ "erro": "...", "codigo": "CONFIRMACAO_INTERVALO_REDUZIDO", "contexto": { "conflitos": [ { "recurso": "VEICULO", "descricao": "Rabecão (SVO2B22)", "inicio": "ISO", "fim": "ISO", "intervalo_minutos": 10 } ] } }` |
| **Sobreposição real** de horários | 409 | `{ "erro": "O veículo já está reservado nesse período.", "codigo": "CONFLITO_AGENDA" }` (qualquer código diferente do de cima) |
| Datas inválidas (fim ≤ início, início no passado) | 400 | `{ "erro", "detalhes" }` |
| Perfil sem permissão | 403 | |

**A segunda confirmação:**
- Depois que o gestor marca a ciência, o front reenvia **o mesmo corpo** com `"confirmar_intervalo_reduzido": true`.
- **Revalidar tudo sob lock** nesse momento. A flag só autoriza a folga curta, nunca uma sobreposição real. Um replay sem nova validação não pode passar.

**Regras do agendamento (DVP e HU):**
- **Intervalo:** usar intervalos `[inicio, fim)`.
- **Recursos verificados:** veículo, motorista e equipe (se for informada), incluindo reservas futuras.
- **Também validar:** CNH, veículo em manutenção e capacidade de corpos.
- **Equipe:** opcional; só reservar o que for informado.
- **Fuso:** o front envia ISO em UTC, a partir do horário local do navegador (America/Maceio).
- **Auditoria:** registrar autor, horários e recursos da exceção de intervalo curto.

### 5.3 Atrasos e liberação da próxima coleta (SCRUM-183)

O front desta entrega **não depende** da 183. Ela só muda o status que a listagem devolve. Quando houver um status novo, como "liberada para iniciar" ou "bloqueada por coleta em curso", avisar o front para incluir o rótulo e a cor.

---

## 6. Já resolvido em PR aberto

- **SCRUM-177**, recusa administrativa obrigatória (PR #122): o contrato bate com o front (`motivo` de 1 a 200 caracteres; GESTOR_SVO sem análise). O front já valida o mesmo limite.

## 7. Checklist para ligar cada interruptor

1. O PR do back e o do banco estão na `develop`, com testes.
2. Rodar o cenário do item no ambiente de teste com o perfil indicado.
3. Mudar o interruptor para `true` em `recursosBackend.ts` (PR de uma linha).
4. Rodar `npx vitest run`. Os testes do front já cobrem os dois estados de cada interruptor.
