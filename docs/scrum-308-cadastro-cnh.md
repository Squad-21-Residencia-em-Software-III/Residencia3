# SCRUM-308: cadastro e edição de CNH de motoristas

Com esta entrega, o perfil competente registra e corrige a CNH de um usuário-motorista que já existe. Os zeros à esquerda são preservados, cadastros duplicados são barrados no banco e a auditoria não guarda o número.

Dependências: SCRUM-15, SCRUM-63 e SCRUM-64 (contrato), SCRUM-301 (história), SCRUM-297 (homologação).

## Ativação

A escrita fica **desligada por padrão**. Ela depende da confirmação institucional da matriz por ação e por unidade.

| Camada | Variável | Desligada |
|---|---|---|
| Backend | `MOTORISTAS_ESCRITA_ATIVA=true\|false` | As quatro rotas novas respondem 404 aos perfis permitidos e 403 aos demais. |
| Frontend | `VITE_MOTORISTAS_ESCRITA_ATIVA=true\|false` | O botão "Cadastrar motorista" e a coluna "Ações" não aparecem. |

Na variável do backend, qualquer valor diferente de `true` ou `false` impede a inicialização. Ligue as duas variáveis juntas, e só depois da migration desta issue.

## Competência

Esta é a regra 6 de `docs/matriz-de-acesso.md`:

| Perfil | Motoristas FROTA | Motoristas SVO |
|---|---|---|
| Administrador | cadastra, lê o número integral, corrige | cadastra, lê o número integral, corrige |
| Gestor de Frota | cadastra, lê o número integral, corrige | 403 |
| Gestor SVO (associado à unidade SVO) | 403 | cadastra, lê o número integral, corrige |
| Gestor SVO sem associação | 403 | 403 |
| Demais perfis | 403 | 403 |

O `tipo_motorista` é derivado do perfil do usuário selecionado (`MOTORISTA_FROTA` vira `FROTA`, `MOTORISTA_SVO` vira `SVO`). O cliente não envia esse campo.

## Contrato

### Rotas

- `GET /api/motoristas`: lista sem o número integral. Cada item traz `cnh_final` (os 4 dígitos finais) no lugar de `numero_cnh`. A busca da tela vale só pelo nome.
- `GET /api/motoristas/me`: o próprio motorista vê a própria CNH. Sem mudança.
- `GET /api/motoristas/usuarios-elegiveis`: devolve `[{ id, nome, perfil }]`. Lista usuários ativos com perfil de motorista que o autor pode gerir e que ainda não têm registro.
- `GET /api/motoristas/:id`: devolve `MotoristaDetalhe`, com o número integral e `Cache-Control: no-store`.
- `POST /api/motoristas`: responde 201 com `Location` e devolve `MotoristaDetalhe`.
- `PATCH /api/motoristas/:id`: altera só os campos enviados e devolve `MotoristaDetalhe`.

### Corpos e DTO

```ts
// POST (.strict(): qualquer outro campo, como tipo_motorista, status, perfil, unidade_id ou id → 400)
{ usuario_id: number; numero_cnh: string; categoria_cnh: string; validade_cnh: 'AAAA-MM-DD' }
// PATCH (.strict(), ao menos um campo; usuario_id, tipo_motorista e status não podem ser alterados)
{ numero_cnh?: string; categoria_cnh?: string; validade_cnh?: 'AAAA-MM-DD' }
// MotoristaDetalhe
{ id, usuario_id, nome, numero_cnh, categoria_cnh, validade_cnh, tipo_motorista, status, cnh_vencida: boolean }
```

### Erros

| Status | Corpo | Quando |
|---|---|---|
| 400 | `{ erro: 'Dados inválidos', detalhes: [{ campo, mensagem }] }` | Validação Zod; `campo` é `numero_cnh`, `categoria_cnh`, `validade_cnh`, `usuario_id` ou o campo indevido |
| 400 | `{ erro: 'ID do motorista inválido' }` | `:id` não é um inteiro entre 1 e 2147483647 |
| 403 | `{ erro }` | Perfil sem permissão, operação de outra competência ou Gestor SVO sem associação |
| 404 | `{ erro }` | Motorista inexistente ou escrita desligada |
| 409 | `{ erro: 'Já existe um motorista cadastrado com esta CNH', codigo: 'CNH_DUPLICADA' }` | CNH equivalente já cadastrada |
| 409 | `{ erro: 'Este usuário já possui cadastro de motorista', codigo: 'MOTORISTA_JA_CADASTRADO' }` | O usuário já tem registro |
| 422 | `{ erro, codigo: 'USUARIO_NAO_ELEGIVEL' }` | Usuário inexistente, inativo ou sem perfil de motorista |

Nenhuma resposta 409 revela id, nome ou outro dado do titular do registro em conflito.

## Regras de validação

As regras estão em `src/backend/src/constants/cnh.ts`, e o espelho do cliente em `src/frontend/src/utils/cnh.ts`.

**Número**
- É sempre texto: um número JSON é rejeitado, porque perderia os zeros à esquerda.
- A normalização remove **apenas** espaços, pontos e hífens.
- Depois de normalizado, precisa ter exatamente 11 dígitos.
- Números manifestamente inválidos, com todos os dígitos iguais, são rejeitados.

**Dígito verificador: não implementado.** O art. 10, inciso I, da Resolução CONTRAN 1.020/2025 descreve o Registro Nacional como nove caracteres mais dois dígitos verificadores, mas não especifica o algoritmo. Sem a especificação oficial vigente e exemplos confiáveis, a validação fica só estrutural, isolada em `validarEstruturaCnh`. Qualquer verificação de DV no futuro precisa registrar a evidência normativa no PR.

**Categoria**
- Recebe `trim` e é convertida para maiúsculas.
- Precisa estar na lista aprovada: `A, B, C, D, E, AB, AC, AD, AE`, como string ordenada.
- `ACC` fica fora porque não habilita veículos da frota.
- A lista ainda depende de confirmação institucional.

**Validade**
- Data civil estrita no formato `AAAA-MM-DD`: confere dias do mês e ano bissexto, sem passar por `Date`, sem rolagem de dia e sem timestamp.
- Limites: de 2000-01-01 a 2099-12-31.
- Ela é gravada em coluna `date` e lida com `to_char`.

**CNH vencida** é aceita. A resposta traz `cnh_vencida: true`, comparando datas civis no fuso America/Sao_Paulo. É uma condição distinta de dado malformado.

## Banco

A migration `20261128120000_scrum_308_unicidade_cnh_motoristas.js` é não destrutiva:

1. Faz uma pré-checagem só de leitura dos grupos de CNH equivalente e dos `usuario_id` duplicados. Se encontrar algum, **aborta**: a transação é desfeita, nenhuma linha muda, e a mensagem traz as contagens.
2. Cria `uq_motoristas_numero_cnh_canonico` sobre `regexp_replace(numero_cnh, '[[:space:].-]', '', 'g')`.
3. Cria `uq_motoristas_usuario_id` em `(usuario_id) WHERE usuario_id IS NOT NULL`.
4. O `down` remove os dois índices.

Não altera nenhuma linha nem FK. Viagens, ordens, abastecimentos, multas e evidências continuam com os vínculos.

## Concorrência

O cadastro roda numa única transação:

1. `SELECT ... FOR UPDATE` no usuário.
2. `pg_advisory_xact_lock(hashtext('motoristas.cnh:' || canônico))`.
3. Pré-checagem canônica.
4. INSERT.
5. Auditoria.

Uma corrida que passe da pré-checagem é barrada pelos índices únicos, e o erro 23505 vira 409 pelo nome da restrição.

## Auditoria e minimização

- As ações de auditoria são `CADASTROU_MOTORISTA id=<id> usuario_id=<id>` e `ATUALIZOU_MOTORISTA id=<id> campos=<nomes>`, no módulo `MOTORISTAS`. Ficam no mesmo commit do dado: se a auditoria falhar, o cadastro é desfeito. **O número nunca entra na auditoria.**
- `GET /documentos/vencimentos` passou a mostrar a CNH como `•••••••1234`.
- O log de requisição registra só método, status, duração e requestId, nunca corpo nem caminho.
- O número integral aparece apenas em `GET/POST/PATCH /motoristas/:id`, com `no-store`, no formulário de edição.

## Inventário de legado e saneamento

O comando `npm run db:inventariar-cnh` (em `src/backend`) é somente leitura. Ele reporta:
- formatos (11 dígitos, com separadores, comprimento diferente, caracteres não numéricos, dígitos repetidos);
- categorias fora da lista;
- validades fora dos limites e vencidas;
- registros sem usuário;
- colisões, mostradas só com ids e os 4 dígitos finais.

A fixture sintética de legado está em `src/backend/src/tests/fixtures/motoristasLegado.ts`.

Se a migration abortar:
1. Rode o inventário e leve os grupos de colisão (ids) ao responsável pelos dados.
2. Para cada grupo, decida com aprovação qual registro permanece. Os demais podem estar referenciados por viagens ou abastecimentos (FK `RESTRICT`), por isso **não apague linhas**. A correção é o número do registro errado.
3. Faça as correções aprovadas e rode o inventário de novo até `podeAplicarRestricao: true`. Depois disso, aplique a migration.

## Evidências desta entrega

Ambiente: Windows 10, Node local, PostgreSQL 15 descartável em container (`frotas_teste`, porta 55433, role de aplicação `frotas_app` criada por `database/init/01-criar-usuario-app.sh`). Todos os dados são sintéticos.

| Cenário | Resultado |
|---|---|
| Migrations do zero em banco vazio (37, incluindo a 308) | ✅ |
| `down` e `up` da 308 em banco com as seeds; hash md5 das linhas de `motoristas` antes e depois | ✅ idêntico (`5fb998a2…`, 2 linhas) |
| Inventário em banco com as seeds | ✅ `podeAplicarRestricao: true` |
| `motoristaCnhPostgres.test.ts` (`MOTORISTAS_CNH_POSTGRES_TESTS=1`) | ✅ 16/16 |
| Testes de rota, serviço e validação do backend (`motoristaRoutes`, `motoristaService`, `cnhValidacao`, `matrizAcesso`) | ✅ |
| Suíte completa do backend sem banco | ✅ 94 arquivos, 2273 testes |
| Suítes PostgreSQL existentes com role de superusuário | ✅ sem regressão, exceto as anotadas abaixo |
| Frontend: `ModalMotorista`, `MotoristasPage`, `permissoes` | ✅ 47 testes |
| `npm run build` do frontend | ✅ |

O teste PostgreSQL cobre:
- gravação do HTTP até o banco;
- zeros preservados;
- validade sem timestamp;
- auditoria sem o número;
- lista, vencimentos e `/auditorias` sem o número;
- CNH vencida aceita;
- dois cadastros concorrentes com representação equivalente (resultado `[201, 409]`, uma linha);
- índice canônico sem a pré-checagem;
- a mesma pessoa cadastrada em paralelo (`[201, 409]`);
- edição que preserva campos;
- 409 na edição sem identificar o terceiro;
- competência FROTA/SVO;
- Gestor SVO sem associação;
- usuário sem perfil de motorista (422);
- rollback quando a auditoria falha;
- migration em esquema vazio e populado, com abort por CNH equivalente e por usuário duplicado, preservando as linhas;
- vínculos de viagens e abastecimentos.

**Não executados ou com ressalva:**
- `agendaSvoPostgres` e `chegadaColetaSvoPostgres` exigem um container com porta interna 55432 e IP fixo, e não rodaram. Pela leitura do código, elas criam um condutor novo por motorista, então o índice por usuário não as afeta.
- `evidenciaOdometroPostgres` falhou num cenário de retenção quando rodou em paralelo com as demais suítes. Isolada, passou (10/10).
- Com a role de aplicação real, várias suítes antigas falham por permissão (DROP/CREATE ROLE, DELETE em tabelas de notificação). Isso não tem relação com esta issue.
- No frontend, `relatoriosApi.test.ts` falha também em `develop` (`object.stream is not a function`, ambiente jsdom), e `SessaoPush.test.tsx` é instável (passa isolado).
- Capturas de tela anonimizadas e validação manual no navegador não foram feitas nesta sessão.
- SHA, PR e CI: registrar no PR para `develop`.
