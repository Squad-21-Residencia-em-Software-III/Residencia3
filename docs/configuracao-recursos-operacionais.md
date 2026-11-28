# Configuração dos recursos operacionais

O backend carrega as flags no início do processo. O frontend usa as nove chaves de visibilidade marcadas na tabela, com prefixo `VITE_`, no momento do build. As autorizações e as chaves de retenção ficam no servidor.

| Backend legado | Backend atual | Frontend |
| --- | --- | --- |
| `FASE3_MAPAS_INTERNOS` | `MAPAS_INTERNOS_ATIVOS` | `VITE_FASE3_MAPAS_INTERNOS` → `VITE_MAPAS_INTERNOS_ATIVOS` |
| `FASE3_MULTIPLAS_PARADAS` | `MULTIPLAS_PARADAS_ATIVAS` | `VITE_FASE3_MULTIPLAS_PARADAS` → `VITE_MULTIPLAS_PARADAS_ATIVAS` |
| `FASE3_MAPAS_SVO` | `MAPAS_SVO_ATIVOS` | `VITE_FASE3_MAPAS_SVO` → `VITE_MAPAS_SVO_ATIVOS` |
| `FASE3_PORTAL_SVO` | `PORTAL_SVO_ATIVO` | `VITE_FASE3_PORTAL_SVO` → `VITE_PORTAL_SVO_ATIVO` |
| `FASE3_ACOMPANHAMENTO_EXTERNO` | `ACOMPANHAMENTO_EXTERNO_SVO_ATIVO` | `VITE_FASE3_ACOMPANHAMENTO_EXTERNO` → `VITE_ACOMPANHAMENTO_EXTERNO_SVO_ATIVO` |
| `FASE3_GPS_OBRIGATORIO` | `GPS_OBRIGATORIO_ATIVO` | `VITE_FASE3_GPS_OBRIGATORIO` → `VITE_GPS_OBRIGATORIO_ATIVO` |
| `FASE3_EMERGENCIA_GPS` | `EMERGENCIA_GPS_ATIVA` | `VITE_FASE3_EMERGENCIA_GPS` → `VITE_EMERGENCIA_GPS_ATIVA` |
| `FASE3_CAPTURA_PERIODICA` | `CAPTURA_PERIODICA_GPS_ATIVA` | `VITE_FASE3_CAPTURA_PERIODICA` → `VITE_CAPTURA_PERIODICA_GPS_ATIVA` |
| `FASE3_CONFIRMACAO_AUTOMATICA` | `CONFIRMACAO_AUTOMATICA_PARADAS_ATIVA` | `VITE_FASE3_CONFIRMACAO_AUTOMATICA` → `VITE_CONFIRMACAO_AUTOMATICA_PARADAS_ATIVA` |
| `FASE3_RETENCAO_GPS_CHECKPOINTS` | `RETENCAO_GPS_CHECKPOINTS_ATIVA` | — |
| `FASE3_RETENCAO_GPS_INTERMEDIARIOS` | `RETENCAO_GPS_INTERMEDIARIOS_ATIVA` | — |
| `FASE3_RETENCAO_EXTERNA` | `RETENCAO_SOLICITACOES_EXTERNAS_SVO_ATIVA` | — |
| `FASE3_EMERGENCIA_GPS_AUTORIZADA` | `EMERGENCIA_GPS_AUTORIZADA` | — |
| `FASE3_PARAMETROS_CONFIRMACAO_HOMOLOGADOS` | `PARAMETROS_CONFIRMACAO_PARADAS_HOMOLOGADOS` | — |
| `FASE3_RETENCAO_GPS_CHECKPOINTS_INVENTARIO_VALIDADO` | `RETENCAO_GPS_CHECKPOINTS_INVENTARIO_VALIDADO` | — |
| `FASE3_RETENCAO_GPS_CHECKPOINTS_SIMULACAO_VALIDADA` | `RETENCAO_GPS_CHECKPOINTS_SIMULACAO_VALIDADA` | — |
| `FASE3_RETENCAO_GPS_CHECKPOINTS_AUTORIZADA` | `RETENCAO_GPS_CHECKPOINTS_AUTORIZADA` | — |
| `FASE3_RETENCAO_GPS_INTERMEDIARIOS_INVENTARIO_VALIDADO` | `RETENCAO_GPS_INTERMEDIARIOS_INVENTARIO_VALIDADO` | — |
| `FASE3_RETENCAO_GPS_INTERMEDIARIOS_SIMULACAO_VALIDADA` | `RETENCAO_GPS_INTERMEDIARIOS_SIMULACAO_VALIDADA` | — |
| `FASE3_RETENCAO_GPS_INTERMEDIARIOS_AUTORIZADA` | `RETENCAO_GPS_INTERMEDIARIOS_AUTORIZADA` | — |
| `FASE3_RETENCAO_EXTERNA_INVENTARIO_VALIDADO` | `RETENCAO_SOLICITACOES_EXTERNAS_SVO_INVENTARIO_VALIDADO` | — |
| `FASE3_RETENCAO_EXTERNA_SIMULACAO_VALIDADA` | `RETENCAO_SOLICITACOES_EXTERNAS_SVO_SIMULACAO_VALIDADA` | — |
| `FASE3_RETENCAO_EXTERNA_AUTORIZADA` | `RETENCAO_SOLICITACOES_EXTERNAS_SVO_AUTORIZADA` | — |

## Precedência e bloqueios

- A chave atual é a principal. Se estiver ausente, a chave antiga ainda é aceita. Se as duas estiverem definidas, precisam concordar. Qualquer divergência bloqueia a flag ou autorização, inclusive se um dos valores estiver vazio ou for inválido.
- Somente o valor literal `true` ativa uma chave. A ausência, o valor vazio e valores inválidos deixam a chave desativada. O backend registra os nomes de chaves inválidas ou conflitantes no evento `RECURSOS_OPERACIONAIS_CONFIG_BLOQUEADA`, sem registrar seus valores. Atualize filtros de log que ainda busquem `FASE3_CONFIG_BLOQUEADA`.
- Portal manual, acompanhamento externo e mapas têm flags independentes. A emergência exige GPS obrigatório e autorização. A confirmação automática exige múltiplas paradas, captura periódica e parâmetros homologados. Cada categoria de retenção exige inventário, simulação e autorização próprios.
- O servidor aplica as permissões e valida a disponibilidade por operação. Rotas bloqueadas mantêm o retorno `404 RECURSO_DESATIVADO`. Viagens em andamento continuam utilizando a política registrada na saída.

## Transição por ambiente

1. No desenvolvimento e no Docker Compose, aplique a tabela ao `.env` do backend e aos arquivos `.env*` usados pelo Vite. Para instalações novas, use as chaves atuais dos exemplos.
2. No Render, aplique os nomes de backend ao serviço e a seus grupos de variáveis, se usados. No Vercel, aplique os nomes `VITE_` em cada escopo que usa as flags, incluindo Preview, Development e Production. Preserve o valor efetivo de cada ambiente. Para variáveis ausentes, mantenha o recurso desligado.
3. Se versões anteriores ainda estiverem implantadas ou puderem voltar por rollback, mantenha os dois nomes com valores idênticos. Reinicie o backend e gere um novo build do frontend após a alteração. Verifique a disponibilidade e as negativas de acesso em homologação antes de solicitar a alteração em produção.
4. Remova as chaves antigas do código em um PR posterior, após confirmar a configuração atual em todos os ambientes, inclusive previews ativos, e encerrar a janela de rollback para versões que só leem as chaves antigas.

O workflow do GitHub Actions configura no próprio repositório as chaves semânticas das suítes PostgreSQL, incluindo `SOLICITACOES_EXTERNAS_SVO_DB_DESCARTAVEL` para a validação do portal. Reproduções locais devem usar os nomes do workflow e um banco descartável.

O módulo `database/scrum263-privilegios.cjs` preserva o caminho e o export exigidos pela migration histórica. A implementação e os consumidores atuais usam `database/privilegiosSolicitacoesExternasSvo.cjs`. Esse caminho histórico precisa permanecer enquanto a migration fizer parte da cadeia executada pelo Knex.
