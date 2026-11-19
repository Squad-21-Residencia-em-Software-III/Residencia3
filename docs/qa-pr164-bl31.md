# PR #164 — correções BL31 para nova revisão independente

Data da validação: 18/11/2026, America/Fortaleza. Este documento registra implementação e testes; a decisão de integração pertence ao QA independente.

## A. Identificação

- Repositório: [Squad 21 / Residencia3](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3).
- PR existente: [#164](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/164).
- Branch: `fix/bl31-no-local`; destino: `develop`.
- HEAD remoto anterior: `1c7a22b683b41662e93d5ee3c6d9d2ba4d2307f6`.
- `develop` integrada: `bdccf663899b8586d59246f022e3b6fb691f9dee`.
- Commit de integração: `2f6c85941d883c150212cf1c7a15a2444d336b46` (merge normal, sem rebase).
- O commit final é o commit que contém este relatório, consultável em `git log -1` e no HEAD do PR após publicação.
- Histórico original preservado: `8aeb057`, de Leonardo H., e `1c7a22b`, de Kaylan. Nenhuma nova integração do #163.
- Worktree separada, criada sem alterar os arquivos locais nem a branch de outra entrega.

## B. Diagnóstico e estado do Jira

Fontes consultadas: [revisão de QA](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/164#issuecomment-6971659992), [observações do frontend](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/164#issuecomment-6980615864) e contrato do [PR #167](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/167).

| Jira | Estado observado | Responsável observado |
| --- | --- | --- |
| [SCRUM-109](https://squad21.atlassian.net/browse/SCRUM-109) | Em Revisão | Kaylan |
| [SCRUM-36](https://squad21.atlassian.net/browse/SCRUM-36) | Em Revisão | Sem responsável |
| [SCRUM-196](https://squad21.atlassian.net/browse/SCRUM-196) | Sendo feito | Matheus Andrade |
| [SCRUM-198](https://squad21.atlassian.net/browse/SCRUM-198) | Em Revisão | Gabriel de Arruda Cordeiro |
| [SCRUM-183](https://squad21.atlassian.net/browse/SCRUM-183) | Em Revisão | Matheus Andrade |
| [SCRUM-182](https://squad21.atlassian.net/browse/SCRUM-182) | Em Revisão | Matheus Andrade |
| [SCRUM-166](https://squad21.atlassian.net/browse/SCRUM-166) | Sendo feito | Sem responsável |
| [SCRUM-204](https://squad21.atlassian.net/browse/SCRUM-204) | Feito | Matheus Andrade |

As decisões finais confirmam motorista responsável como autor operacional, equipe opcional, ausência de exigência de escalas, designação individual e ocupação até a conclusão real. A SCRUM-204 mantém evidências e retenção vinculadas ao deslocamento físico. Nenhum estado, responsável ou comentário do Jira foi alterado.

Problemas confirmados:

1. Rota de chegada e serviço permitiam operação SVO por gestores/administrador; início/fim também usavam autorização de gestão.
2. Disponibilidade, alocação e fila exigiam escala, contrariando a decisão final do MVP.
3. Fila e reprogramação não consideravam o mesmo integrante designado em equipes diferentes.
4. Integração automática com a develop conservava dois conflitos semânticos: upload de foto de CHEGADA rejeitava `NO_LOCAL`; conclusão do deslocamento ignorava outra ordem `NO_LOCAL`, antecipando encerramento e retenção.
5. Início de manutenção podia sobrepor coleta efetivamente ativa.
6. Rollback dos índices podia retirar cobertura de `NO_LOCAL` enquanto essas ordens ainda existiam.

Já estavam corretos no PR: transição exclusiva a partir de `EM_DESLOCAMENTO`, lock global/linha da ordem, retorno por `viagemModel.buscarPorId`, finalização direta compatível de `EM_DESLOCAMENTO`, inclusão de `NO_LOCAL` em ocupação de veículo/equipe, recálculo de recursos e proteção do rollback principal. Foram preservados e testados. Não houve conflitos textuais no merge da develop; os conflitos semânticos de fotos foram corrigidos sem substituir a implementação recente.

## C. Correções implementadas

| Arquivos / funções | Alteração e efeito esperado |
| --- | --- |
| `viagemRoutes.ts`, `viagemController.ts`, `autorizacaoOperacionalSvo.ts`, `viagemService.ts` | Chegada exclusiva do `MOTORISTA_SVO`; mesma política em início/fim no controller e no serviço. Reutiliza vínculo por `motoristas.id = ordem.motorista_id` e `motoristas.usuario_id = autor.id`. Gestão e leitura de evidências preservadas. |
| `viagemService.iniciarViagem` | Autoriza vínculo e estado antes de reavaliar a fila; relê liberação sob o mesmo lock após o recálculo. Operação alheia não gera alterações nem auditoria de sucesso. |
| `equipeSvoService.consultarDisponibilidade`, `viagemService.alocarOrdemSvo`, `filaSvoService.reavaliarFilaSvo` | Retira exigência de escala; mantém existência de equipe, conflitos, prioridade e validações temporais. Não remove tabelas legadas. |
| `filaSvoService.reavaliarFilaSvo` | Considera designações ativas em `ordens_svo_integrantes` na disputa e nos alertas, inclusive entre equipes distintas. Mantém `inicio_previsto ASC, id ASC`, lock de agenda e liberação sem início fictício. |
| `agendaSvoService.validarAgendaSvo`, `viagemService.alocarOrdemSvo` | Na reprogramação, preserva designações, valida cabine menos motorista e impede troca de equipe incompatível. Conflitos individuais entram na mesma regra temporal e na assinatura da confirmação de intervalo. Não cria gestão de integrantes. |
| `evidenciaOdometroService` | Permite foto de CHEGADA em SVO `NO_LOCAL` e reconhece saída já realizada na consulta. Demais validações de upload, vínculo e segurança permanecem. |
| `evidenciaOdometroTransicao.concluirOperacao` | Não conclui deslocamento compartilhado nem inicia retenção enquanto outra ordem permanece `NO_LOCAL`. |
| `manutencaoService` | Criação/edição/transição para `EM_ANDAMENTO` exige ausência de coleta `EM_DESLOCAMENTO`/`NO_LOCAL`, sob locks de agenda e veículo. Agendamento de manutenção continua permitido. |
| `errorHandler.ts` | Ausência da tabela de designações retorna 503 controlado, sem expor SQL. |
| Migration `20261118010000` | Rollback recusa execução com ordens `NO_LOCAL`, antes de alterar índices. |
| Testes de viagens, agenda, equipes, fila, manutenção, fotos e novo `bl31Postgres.test.ts` | Negativas de autorização, atomicidade, estados, concorrência, recursos/designações, retorno GET, migrations e regressões com banco real. |

## D. Regras preservadas

- Fluxo `ALOCADA → EM_DESLOCAMENTO → NO_LOCAL → CONCLUIDA`, com finalização direta de `EM_DESLOCAMENTO` ainda aceita.
- Motorista vinculado por identidade autenticada e cadastro próprio; IDs de usuário/motorista/equipe/ordem não são intercambiáveis.
- Chegada altera apenas status; preserva ID, quilômetros, saída/conclusão, solicitação e designações. Repetição retorna 409 com uma única auditoria de chegada.
- Veículo, motorista, equipe e integrantes continuam ocupados até conclusão efetiva, inclusive após previsão vencida.
- Reserva futura compatível continua válida; sobreposição bloqueada; intervalo menor que 20 minutos continua sujeito à confirmação existente.
- Capacidade de corpos permanece entre 1 e 4 e limitada ao veículo, independente da cabine. Reservas temporais consecutivas não somam indiscriminadamente.
- Fila conserva auditoria/alertas, prioridade, desempate e proteção contra concorrência, sem inventar km ou saída.
- Equipe permanece opcional e sem escala obrigatória; designações legadas não são inventadas. SCRUM-196/#162 continua responsável pelo gerenciamento completo.
- Fotografias, exigência configurável, quilometragem, upload, autorização, compartilhamento e retenção de 12 meses continuam integrados.
- Permissões e regras de viagens administrativas preservadas; regressão automatizada executada.

## E. Testes executados

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| `npm ci` backend/frontend | Passou | Ambos instalados pelos lockfiles; auditorias retornaram zero vulnerabilidades. |
| `JWT_SECRET=... npm test -- --reporter=dot` backend | Passou | 60 arquivos passaram; 1.272 testes passaram; 40 condicionais ignorados nesta execução; zero falhas e zero todo. |
| PostgreSQL BL31 e agenda | Passou | `vitest run src/tests/bl31Postgres.test.ts src/tests/agendaSvoPostgres.test.ts --no-file-parallelism`: 32 passaram (20 BL31 + 12 agenda), zero ignorados/falhas/todo. |
| PostgreSQL fotos | Passou | `vitest run src/tests/evidenciaOdometroPostgres.test.ts`: 4 passaram, zero ignorados/falhas/todo. Inclui foto obrigatória e duas ordens `NO_LOCAL` no mesmo deslocamento. |
| PostgreSQL auditoria | Passou | `vitest run src/tests/auditoriaIntegracao.test.ts`: 4 passaram, zero ignorados/falhas/todo. |
| `npm run typecheck` backend | Passou | `tsc --noEmit`, exit 0. |
| `npm run build` backend | Passou | `tsc`, exit 0. |
| `npm test -- --reporter=dot` frontend | Passou | 43 arquivos / 303 testes passaram; zero ignorados/falhas/todo. |
| `npm run build` frontend | Passou | TypeScript + Vite, exit 0; aviso de chunk JS maior que 500 kB. |
| Auditoria conforme CI | Passou | 4 testes do script de auditoria; script executado nos dois pacotes, zero vulnerabilidades. |
| `git diff --check` | Passou | Sem erros de whitespace ou marcadores de conflito. |

Os 40 testes condicionais da execução padrão foram TODOS executados separadamente com as flags e bancos locais exigidos: 20 BL31, 12 agenda, 4 fotos e 4 auditoria. Logo, nenhuma integração ficou sem execução local. A separação existe porque as suítes exigem nomes de banco diferentes; não houve remoção de testes nem `skip` para ocultar falhas.

Durante a implementação houve falhas intermediárias por expectativas antigas de gestor, um mock incompatível, endereço interno do Docker e os conflitos reais com evidências descritos acima. Todas foram corrigidas e as respectivas suítes repetidas. O teste instável de recusa/confirmação mencionado no comentário do frontend não falhou nas execuções finais; isso não demonstra ausência de instabilidade futura.

### Reprodução segura das integrações

Utilizar exclusivamente um PostgreSQL descartável local. Na validação foi criado `fsph-pr164-postgres`, imagem PostgreSQL 17, sem volume do projeto, publicado apenas em `127.0.0.1:55432`, servidor na porta 55432. O endereço interno foi confirmado por `docker inspect`, assim como a publicação restrita a loopback.

Variáveis comuns (valores de credenciais são os escolhidos para o contêiner descartável, nunca os do Neon):

```text
JWT_SECRET=<segredo exclusivo de teste com pelo menos 32 caracteres>
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=55432
POSTGRES_USER=<usuário do PostgreSQL descartável>
POSTGRES_PASSWORD=<senha descartável>
POSTGRES_SSL=false
```

Aplicar `npm run migrate` em cada base local com `DB_ROLE=migration`, sem carregar configuração de ambiente compartilhado. Depois executar cada grupo:

| Grupo | Banco e flags |
| --- | --- |
| BL31 + agenda | `POSTGRES_DB=fsph_scrum166_teste`, `BL31_POSTGRES_TESTS=1`, `SCRUM166_POSTGRES_TESTS=1`; no Docker, `POSTGRES_TEST_CONTAINER_IP=<IP privado obtido de docker inspect>`. As suítes exigem loopback como host cliente e conferem banco/porta/endereço da conexão. |
| Fotos | `POSTGRES_DB=frotas_teste`, `SCRUM208_POSTGRES_TESTS=1`. |
| Auditoria | `POSTGRES_DB=frotas_svo_testes_bl04`, `RUN_DB_INTEGRATION=true`. |

## F. Banco de dados

- As 24 migrations, incluindo SCRUM-183/198/210, foram aplicadas com sucesso nas bases descartáveis.
- As duas migrations BL31 foram revisadas sem duplicação do #163.
- O teste BL31 cria schema exclusivo dentro de transação, aplica as migrations anteriores, insere legado, aplica BL31 e posteriores, valida preservação do legado, `NO_LOCAL`, unicidade por solicitação, recursos obrigatórios e rejeição de status inválido.
- Confere os três índices parciais relevantes e sua inclusão de `NO_LOCAL`.
- Exercita recusa do rollback das duas migrations com `NO_LOCAL`, depois reverte em ordem inversa com ordem concluída e verifica preservação de dados/rejeição do status removido. O schema de teste inteiro é desfeito por rollback da transação.
- Única alteração de migration nesta correção: guarda adicional no `down` dos índices. Não foi criada coluna de chegada nem alterada a estrutura de designações/fotos.
- Gabriel Arruda deve revisar as migrations e a guarda adicional antes da aplicação no ambiente do projeto. O teste local não substitui essa revisão.
- O Neon compartilhado não foi conectado nem modificado. Nenhuma migration/seed/SQL foi executada nele.

## G. Git e publicação

Merge normal da develop e commit Conventional Commits de correção, mantendo o commit original de Leonardo H. e a branch original. Publicação prevista por `git push upstream fix/bl31-no-local`, sem force. O resultado do push, SHA final e checks do HEAD são confirmados no relatório de entrega; este texto não usa os checks antigos como evidência do commit novo.

## H. Pendências e riscos reais

- Revisão independente de QA e revisão das migrations por Gabriel ainda necessárias antes da integração/aplicação no ambiente do projeto.
- Sem homologação manual em produção/Neon, sem teste de storage externo real. Upload e download foram testados com armazenamento temporário privado local, como previsto pela suíte existente.
- SCRUM-196/#162 permanece responsável pela interface/gestão completa de integrantes e designações; este PR somente consome designações persistidas e protege sua integração. Não foram criados endpoints ou telas dessa entrega.
- A tabela `ordens_svo_integrantes` da SCRUM-198 passa a ser necessária para fila/reprogramação; ausência gera 503 controlado. Ordem legada sem linhas nessa tabela continua válida.
- Horário de chegada continua rastreado pelo timestamp da auditoria. A coluna específica sugerida no comentário do frontend é evolução opcional dependente de desenho/revisão DB; não integra o contrato obrigatório solicitado aqui.
- Aviso de tamanho de chunk frontend permanece; build passou. Não foi feita alteração de bundling fora do escopo.
- A aplicação real do projeto deve seguir o processo de DB e configuração de fotos já existente; nenhum deploy foi realizado nesta tarefa.

## I. Conclusão para QA

Correções implementadas e verificadas localmente, incluindo PostgreSQL, fluxo de fotos e concorrência. Após confirmação do push e dos checks do HEAD, submeter o mesmo PR aberto à nova revisão independente. O #167 não foi alterado e nenhum merge/auto-merge foi realizado.
