# Matriz de acesso

Este documento registra quem pode fazer o quê na API. As permissões são aplicadas **no backend**, e o frontend apenas reflete o que a API permite. Esconder um botão não substitui a checagem do servidor.

A autorização acontece em três camadas:

1. **Autenticação** (`middlewares/autenticar.ts`): sem token válido, a resposta é **401**. Usuário inativo recebe **403**. O perfil vem sempre do banco, nunca do token.
2. **Perfil** (`middlewares/autorizar.ts`, `autorizar(...perfis)`, criado na BL03): perfil não permitido na rota recebe **403**.
3. **Registro** (services e `exigirAssociacaoSvo`): mesmo com o perfil certo, o usuário só atua sobre registros da sua competência. Fora dela, recebe **403**.

A matriz é verificada rota a rota por `src/backend/src/tests/matrizAcesso.test.ts`, que testa 401 sem token, 403 para os perfis não permitidos e acesso liberado para os permitidos.

## Legenda

| Sigla | Perfil |
|---|---|
| ADM | Administrador |
| SOL | Solicitante (Usuário Institucional) |
| GF | Gestor de Frota |
| GS | Gestor SVO |
| MF | Motorista da frota administrativa |
| MS | Motorista SVO |
| IS | Integrante SVO |

✅ permitido · ❌ 403 · 🔗 permitido, com checagem por registro (veja as regras abaixo)

## Rotas

| Rota | ADM | SOL | GF | GS | MF | MS | IS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /auth/me`, `PATCH /auth/senha` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/usuarios` (todas) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `GET /veiculos` | ✅ | ❌ | ✅ | 🔗² | 🔗¹ | 🔗¹ | ❌ |
| `GET /veiculos/svo/disponiveis`, `/svo/ocupacao` | ✅ | ❌ | ❌ | 🔗² | ❌ | ❌ | ❌ |
| `POST /veiculos`, `PUT /veiculos/:id` | ✅ | ❌ | 🔗⁶ | 🔗²⁶ | ❌ | ❌ | ❌ |
| `POST /abastecimentos`, `GET /abastecimentos/veiculo/:id` | ✅ | ❌ | ✅ | ❌ | 🔗¹ | 🔗¹ | ❌ |
| `GET /solicitacoes-viagem` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /solicitacoes-viagem/minhas` | 🔗⁴ | 🔗⁴ | 🔗⁴ | 🔗⁴ | 🔗⁴ | 🔗⁴ | 🔗⁴ |
| `POST /solicitacoes-viagem` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `GET /solicitacoes-viagem/:id/disponibilidade` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PATCH /solicitacoes-viagem/:id/aprovar`, `/recusar` | 🔗⁵ | ❌ | 🔗⁵ | ❌ | ❌ | ❌ | ❌ |
| `/manutencoes` (todas) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /documentos/vencimentos` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/multas` (todas) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /viagens/minhas` | ❌ | ❌ | ❌ | 🔗⁴ | ❌ | ❌ | ❌ |
| `GET /viagens/coletas-svo/minhas` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔗⁹ |
| `GET /viagens/ordens-svo/pendentes`, `GET /viagens/ordens-svo/:id/designacoes`, `POST /viagens/ordens-svo/:id/reprogramar` | ✅ | ❌ | ❌ | 🔗² | ❌ | ❌ | ❌ |
| `PATCH /viagens/ordens-svo/:id/chegar-local` | ❌ | ❌ | ❌ | ❌ | ❌ | 🔗⁷ | ❌ |
| `PATCH /viagens/administrativas/:id/reprogramar` | ✅ | ❌ | 🔗³ | ❌ | ❌ | ❌ | ❌ |
| `GET /viagens` | ✅ | ❌ | 🔗⁶ | 🔗²⁶ | 🔗⁷ | 🔗⁷ | ❌ |
| `POST /viagens`, `PATCH /viagens/:id/cancelar` | ✅ | ❌ | 🔗⁶ | 🔗²⁶ | ❌ | ❌ | ❌ |
| `PATCH /viagens/:id/iniciar`, `/finalizar` | ✅ | ❌ | 🔗⁶ | 🔗²⁶ | 🔗⁷ | 🔗⁷ | ❌ |
| `POST /evidencias-odometro`, `GET /evidencias-odometro` | ✅ | ❌ | 🔗⁶ | 🔗²⁶ | 🔗⁷ | 🔗⁷ | ❌ |
| `GET /evidencias-odometro/:id/arquivo` | ✅ | ❌ | 🔗⁶ | 🔗²⁶ | ❌ | ❌ | ❌ |
| `GET /motoristas/me` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /motoristas` | ✅ | ❌ | ✅ | 🔗² | ❌ | ❌ | ❌ |
| `GET /unidades` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `/notificacoes`: `GET vapid-public-key`, `POST subscribe`, `POST subscribe/status`, `DELETE unsubscribe`, `GET preferencias`, `PATCH preferencias/:codigo` (SCRUM-237) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /notificacoes/metricas`: totais da fila e dos aparelhos, sem dado pessoal (SCRUM-241) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/unidades/gestores` (consulta e associação) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `GET /dashboard` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/solicitacoes-svo` (todas) | ✅ | ❌ | ❌ | 🔗² | ❌ | ❌ | ❌ |
| `GET /auditorias` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notificacoes` (central In-App) | 🔗⁸ | 🔗⁸ | 🔗⁸ | 🔗⁸ | 🔗⁸ | 🔗⁸ | 🔗⁸ |

Rotas públicas: `GET /status`, `POST /auth/login`, `POST /auth/refresh` e `POST /auth/logout`. As três rotas de autenticação validam a origem. Login e refresh também têm limites próprios de tentativas.

## Regras por registro

1. **Motorista e veículos vinculados.** O motorista só lista, abastece e consulta abastecimentos de veículos **vinculados a ele**: os das suas viagens (`AGENDADA` ou `EM_ANDAMENTO`) ou ordens SVO (`ALOCADA` ou `EM_DESLOCAMENTO`). Além disso, o veículo precisa ser do seu tipo de frota. Ao registrar um abastecimento, o `motorista_id` do corpo é ignorado e vale o motorista do token. Implementação: `veiculoModel.idsVinculadosAoUsuarioMotorista`, `abastecimentoService` e `veiculoService.listar`.
2. **Gestor SVO e a unidade SVO.** O perfil não basta. O Gestor SVO precisa estar **associado à unidade SVO** (`gestores_unidades`) para operar solicitações SVO, viagens e ordens SVO, veículos e motoristas. Sem a associação, recebe 403 "Você não está associado à unidade SVO". Implementação: `exigirAssociacaoSvo`.
3. **Competência administrativa.** Administrador e Gestor de Frota analisam solicitações administrativas. Para reprogramação A6, o Gestor de Frota precisa estar associado à unidade da solicitação. O Gestor SVO acompanha os próprios pedidos administrativos.
4. **Solicitações próprias.** `/minhas` devolve apenas as solicitações do usuário autenticado (`solicitante_id` do token).
5. **Segregação de funções.** Ninguém aprova nem recusa uma solicitação criada por si mesmo, nem o Administrador. A resposta é 403 "Você não pode analisar uma solicitação criada por você".
6. **Tipo de operação.** O Gestor de Frota gerencia veículos e viagens da frota administrativa. O Gestor SVO gerencia os veículos e ordens SVO. O Administrador gerencia ambos.
7. **Viagens do motorista.** O motorista só lista, inicia e finaliza as próprias viagens ou ordens, e só do seu tipo de frota. O condutor designado pode solicitar dispensa de foto por fase. A decisão exige justificativa e é restrita a Administrador (ambas as operações), Gestor de Frota (Administrativo) ou Gestor SVO associado (SVO). O condutor que solicitou a dispensa fica impedido de decidi-la. A consulta de situação do motorista se limita ao seu registro e o arquivo fica disponível apenas aos gestores competentes.
8. **Notificações.** Cada usuário, inclusive o Integrante SVO, só lista, conta e marca os próprios avisos, e só os da operação que o perfil alcança. O Gestor SVO precisa da associação para os avisos SVO. Aviso de outra pessoa responde 404. O conteúdo exige acesso atual ao registro de origem; sem ele, só aparece que houve um aviso (`docs/scrum-226-api-notificacoes.md`). Implementação: `notificacaoService`.

9. **Designação individual SVO.** O Integrante SVO usa a consulta pessoal para designações vigentes e histórico autorizado. A associação à equipe ajuda a organizar a escala. O acesso à coleta depende da designação individual.

Outras proteções que já existiam:

- o Administrador não remove o próprio perfil de administrador nem inativa a própria conta;
- ao trocar o perfil de um gestor, as associações a unidades que ele não pode mais gerir são removidas;
- só perfis compatíveis podem ser associados a cada unidade.

## Decisões da equipe

| Tema | Decisão | Base |
|---|---|---|
| Quem cria solicitação de viagem | Solicitante, Gestor de Frota, Gestor SVO e Administrador. Motoristas não. | O DVP (RF11) atribui o registro ao Usuário Institucional. Os gestores também pedem viagens para a própria unidade, e o motorista executa viagens, não as solicita. |
| Autoaprovação | Bloqueada para todos os perfis | Segregação de funções (RN02: a análise é responsabilidade do gestor, não de quem solicitou) |
| Vínculo motorista–veículo | Pelas viagens e ordens ativas | DVP: "consulta dos veículos a ele vinculados". Não há tabela de vínculo fixo. |
| Gestor SVO | Exige associação à unidade SVO em todas as operações SVO | Consistência com o encaminhamento por unidade (BL15) |
| Disponibilidade | Gestor de Frota e Administrador | RF16 |

### Navegação da SCRUM-166

O seletor não concede acesso à API. Em Solicitações, Administrador vê Administrativo e SVO; Gestor SVO vê SVO e Administrativo, nesta ordem; Gestor de Frota e Solicitante veem Administrativo. A triagem e o cadastro SVO exigem Administrador ou Gestor SVO, com a associação SVO exigida pelo servidor. O Gestor SVO acompanha suas solicitações administrativas por `/minhas`, sem ações de aprovação ou agendamento; as viagens que ele próprio solicitou ficam disponíveis em `/api/viagens/minhas`, com dados operacionais reduzidos. A consulta administrativa de veículos para Gestor SVO deve limitar os campos a modelo, placa, status/disponibilidade e capacidade de ocupantes. A validação por perfil, registro e campo é responsabilidade do servidor.
