# BL35 — Exportação de relatórios gerenciais em Excel/CSV e PDF

Escopo: subtarefas **[BE] Implementar exportação Excel/CSV** e **[BE] Implementar geração de relatório em PDF** da história BL35 (RF18 e RN20).
Os três formatos compartilham o mesmo caminho: a mesma rota, a mesma permissão, o mesmo isolamento por tipo de frota e os mesmos dados (`relatorioService.gerar`).

## Contrato HTTP

Todas as rotas exigem autenticação (`Authorization: Bearer <token>`) e perfil **Administrador** ou **Gestor de Frota**.

| Método | Rota | Resultado |
|---|---|---|
| GET | `/api/relatorios` | Lista os relatórios disponíveis e os formatos aceitos |
| GET | `/api/relatorios/:tipo/exportar` | Baixa o arquivo do relatório |

### `GET /api/relatorios/:tipo/exportar`

| Parâmetro | Onde | Obrigatório | Valores |
|---|---|---|---|
| `tipo` | rota | sim | `viagens`, `abastecimentos`, `manutencoes`, `multas` |
| `formato` | query | sim | `csv`, `xlsx`, `pdf` |
| `inicio` | query | não | data `AAAA-MM-DD`, inclusiva |
| `fim` | query | não | data `AAAA-MM-DD`, inclusiva (deve ser ≥ `inicio`) |

Respostas:

| Status | Quando |
|---|---|
| `200` | Arquivo anexado (`Content-Disposition: attachment; filename="relatorio-<tipo>-AAAA-MM-DD.<ext>"`) |
| `400` | `tipo`, `formato` ou datas inválidos, ou período invertido |
| `401` | Sem token ou token inválido |
| `403` | Perfil sem acesso |
| `422` | O resultado passa do limite do formato: 50.000 linhas (CSV e XLSX) ou 5.000 linhas (PDF). Reduza o período; no PDF, a mensagem sugere usar CSV ou XLSX |

Tipos de conteúdo: `text/csv; charset=utf-8`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` e `application/pdf`.
O cabeçalho `Access-Control-Expose-Headers: Content-Disposition` permite que o frontend leia o nome do arquivo.

## Relatórios

| Tipo | Conteúdo | Coluna usada no período |
|---|---|---|
| `viagens` | Viagens administrativas e ordens SVO (sem ordens aguardando alocação) | saída efetiva, ou a prevista na falta dela (mesmo critério do dashboard) |
| `abastecimentos` | Data, veículo, motorista, fornecedor, posto, quilometragem, litros, valor total e preço por litro | `data_abastecimento` |
| `manutencoes` | Data, veículo, tipo, fornecedor, descrição, custo e status | `data_manutencao` |
| `multas` | Data da infração, veículo, motorista, código, órgão, descrição, pontos, valor, vencimento e pagamento | `data_infracao` |

O período usa o horário de Brasília (`America/Sao_Paulo`): do início do dia inicial ao fim do dia final.

## Permissões por perfil (critério "respeitam as permissões do perfil")

| Perfil | Acesso |
|---|---|
| Administrador | Todos os relatórios, com registros das duas frotas (administrativa e SVO) |
| Gestor de Frota | Todos os relatórios, **somente com registros da frota administrativa** |
| Demais perfis | `403` |

**Isolamento por tipo de frota:** o escopo de cada perfil sai de `TIPOS_POR_PERFIL` (`viagemService`), a mesma regra de `/api/viagens`.

| Relatório | Como o escopo é aplicado na consulta |
|---|---|
| `viagens` | `tipo_operacao` entre os tipos permitidos ao perfil |
| `abastecimentos`, `manutencoes`, `multas` | `veiculos.tipo_frota` entre as frotas permitidas ao perfil |

O Administrador, que enxerga as duas frotas, fica sem filtro de frota. Perfil sem frota permitida não recebe nenhum registro. O filtro de período é combinado ao de frota (as duas condições valem juntas).

A restrição é aplicada na rota (`autorizar`) e de novo no service, sem depender do frontend.
Dados pessoais da população atendida pelo SVO (`dados_solicitante`) não fazem parte de nenhum relatório.

## Formato dos arquivos

- **CSV:** UTF-8 com BOM, separador `;`, quebra de linha CRLF, datas `dd/mm/aaaa`, decimais com vírgula. Abre com acentos corretos no Excel em português.
- **XLSX:** uma aba com cabeçalho em negrito, cabeçalho fixo, filtro automático cobrindo o cabeçalho e todas as linhas de dados (apenas o cabeçalho quando não há registros), larguras ajustadas, datas e números tipados (não texto).
- **Proteção contra injeção de fórmula:** no CSV, texto livre iniciado por `=`, `+`, `-`, `@`, tab ou CR recebe um `'` na frente. No XLSX o texto é gravado como texto literal.
- **PDF:** A4 em paisagem, gerado sem dependências externas (fonte Helvetica, texto selecionável e pesquisável). O cabeçalho traz título, período, **escopo do perfil** (por exemplo, "Escopo: frota administrativa"), total de registros e data de geração no horário de Brasília. A tabela repete o cabeçalho em todas as páginas, tem linhas alternadas, números alinhados à direita e rodapé "Página X de Y".
- **Colunas do PDF:** os relatórios cabem inteiros, exceto `viagens`, que tem 16 colunas. No PDF ela mostra 12 (sem finalidade, solicitante, modelo do veículo e fim previsto); CSV e XLSX levam todas.
- **Texto no PDF:** textos longos quebram em até 4 linhas por célula e são cortados com reticências; números, datas e palavras curtas nunca são quebrados. Caracteres fora do alfabeto latino (por exemplo, emoji) aparecem como `?`. O conteúdo do banco é gravado como texto codificado, sem interpretação de comandos.
- **Limite do PDF:** 5.000 linhas, contra 50.000 do CSV e do XLSX. O PDF é gerado de forma síncrona: com 50.000 linhas seriam cerca de 2.600 páginas, 3,7 s de processamento e 180 MB de memória; com 5.000 são cerca de 260 páginas em 0,5 s.
- Cada exportação é registrada na auditoria (módulo `RELATORIOS`), com tipo, formato, quantidade de linhas e período.

## Decisões a registrar pela equipe

A documentação do projeto exige "relatórios gerenciais em PDF e Excel/CSV" (RN20), mas não define quais relatórios existem nem o formato exato. Foram assumidos os pontos abaixo; **precisam de confirmação do Product Owner/equipe**:

1. **Catálogo inicial (pendente de confirmação):** viagens, abastecimentos, manutenções e multas. Veículos e motoristas ficaram de fora por não terem período natural; podem ser acrescentados em `DEFINICOES` (`relatorioService.ts`) e `relatorioModel.ts`.
2. **Escopo do Gestor de Frota:** somente a frota administrativa em todos os relatórios, para manter a regra já usada em `/api/viagens`.
3. **CSV com `;` e vírgula decimal**, pensando no Excel em pt-BR.
4. **Limites de linhas (pendentes de confirmação):** 50.000 para CSV e XLSX (`LIMITE_LINHAS_EXPORTACAO`) e 5.000 para o PDF (`LIMITE_LINHAS_PDF`).
5. **Auditoria das exportações**, por incluir dados operacionais e nomes de pessoas.
6. **PDF em A4 paisagem, sem totais (pendente de confirmação):** o PDF lista os registros e o total de linhas, mas não soma valores (litros, custos, multas). Se a gestão quiser totais por relatório, é um acréscimo simples.
7. **Colunas de `viagens` no PDF (pendente de confirmação):** 12 das 16, por legibilidade. O detalhe completo está no CSV e no XLSX.
8. **Identidade visual do PDF:** o rodapé usa o texto "Gestão de Frotas - FSPH", sem logotipo. Um logotipo ou outro padrão visual depende de definição do time.

### Pontos em aberto fora do escopo desta entrega

- **Relatórios próprios do SVO:** o documento de permissões prevê relatórios do SVO para o Gestor SVO, enquanto a HU BL35 descreve apenas Gestor de Frota e Administrador. O alinhamento será tratado no planejamento; hoje o Gestor SVO recebe `403`.
- **PDF, interface e novos tipos de relatório:** não fazem parte desta subtarefa.

## Dependência da HU SCRUM-166 (agendamento de ordens SVO)

O relatório de `viagens` lê a consulta unificada `VIAGENS_UNIFICADAS_SQL` (`viagemModel.ts`).
Hoje, para as ordens SVO, essa consulta usa **`data_hora_chamado` como `inicio_previsto`** e deixa `fim_previsto` vazio. Esse valor é a data do chamado, **não o horário definitivo do agendamento**.

A SCRUM-166 permitirá agendar ordens com início e término previstos independentes da data do chamado. Quando ela for entregue:

- a consulta unificada deve passar a expor o início e o término agendados, e o relatório herda a mudança sem alterar o contrato da API;
- até lá, as colunas "Início previsto" e "Fim previsto" das ordens SVO (em CSV, XLSX e PDF) não devem ser lidas como horário agendado;
- o filtro de período das viagens usa `COALESCE(data_hora_efetiva_saida, inicio_previsto)`, então também é afetado pela mudança;
- o teste `relatorioModel.test.ts` confere que a consulta unificada continua fornecendo todas as colunas usadas pelo relatório e falha se alguma for removida ou renomeada.

## Como acrescentar outro relatório ou formato

`relatorioService.gerar(tipo, periodo, autor)` devolve uma `TabelaExportavel` (título, colunas, linhas e, opcionalmente, `colunasPdf` e `notas`) independente de formato.

- **Novo relatório:** incluir o tipo em `TIPOS_RELATORIO` (`constants/relatorios.ts`), a consulta em `relatorioModel.ts` (com o filtro de frota por perfil) e a definição em `DEFINICOES` (`relatorioService.ts`). Se tiver mais de 12 colunas, informar `colunasPdf`.
- **Novo formato:** incluir em `FORMATOS_EXPORTACAO` e registrar o gerador, com o respectivo limite de linhas, no mapa `FORMATOS` de `relatorioService.ts`.

O PDF é gerado por `exportadores/pdfExportador.ts` (layout e escrita do arquivo) e `exportadores/pdfFontes.ts` (métricas da Helvetica). Se a equipe preferir uma biblioteca (por exemplo, `pdfkit`), basta trocar a função `gerarPdf`: o restante da API não muda.

## Como verificar

```bash
cd src/backend
npm run typecheck
npm test
npm run dev
```

Com um token de Gestor de Frota ou Administrador (`TOKEN`):

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/relatorios
curl -H "Authorization: Bearer $TOKEN" -OJ \
  "http://localhost:3000/api/relatorios/abastecimentos/exportar?formato=xlsx&inicio=2026-11-01&fim=2026-11-30"
```

Cenários dos critérios de aceite:

| Critério | Cenário | Esperado |
|---|---|---|
| Usuário autorizado exporta em Excel/CSV | Gestor de Frota chama cada `tipo` com `formato=csv` e `formato=xlsx` | `200` e arquivo que abre no Excel |
| Usuário autorizado exporta em PDF | Gestor de Frota chama cada `tipo` com `formato=pdf` | `200`, `application/pdf` e arquivo que abre em qualquer leitor de PDF |
| PDF respeita o perfil e o tipo de frota | Gestor de Frota e Administrador exportam cada relatório em PDF | O cabeçalho informa o escopo de cada perfil; o Gestor de Frota não recebe registros SVO |
| Respeita o perfil | Solicitante, Gestor SVO ou motorista chama a rota | `403`, sem consulta nem auditoria |
| Respeita o escopo de viagens | Gestor de Frota exporta `viagens` | Nenhuma linha com tipo `SVO` |
| Período | `inicio` e `fim` de um mês | Somente registros daquele período |
| Sem sessão | Chamada sem token | `401` |

## Evidências de validação

Verificado nesta entrega (ambiente de desenvolvimento, sem PostgreSQL):

| Verificação | Resultado |
|---|---|
| `npm run typecheck` e `npm run build` | sem erros |
| Testes das consultas (`relatorioModel.test.ts`) | SQL gerado confere: escopo de frota por perfil, combinação com período, fuso de Brasília, limite |
| Testes dos arquivos (`exportadores.test.ts`) | CSV e XLSX, incluindo o filtro do XLSX (`A1:E3` com dados, `A1:E1` vazio) |
| Cenários pela API (rotas reais, banco simulado) | permissões por perfil, escopo de frota (CSV, XLSX e PDF), período, parâmetros inválidos, limites de 50.000 (CSV/XLSX) e 5.000 linhas (PDF), auditoria |
| Testes do PDF (`pdfExportador.test.ts`) | estrutura do arquivo, conteúdo e acentuação, paginação com cabeçalho repetido, colunas sem quebra indevida, relatório vazio |
| PDF aberto e conferido com ferramentas de PDF (`qpdf`, `pdfinfo`, `pdftotext`, renderização de páginas) | arquivo válido, acentos, separador de milhar, escopo e rodapé corretos; 5.000 linhas em cerca de 0,5 s |
| XLSX aberto em aplicativo de planilhas (LibreOffice) | cabeçalho em negrito, datas `dd/mm/aaaa`, data e hora no horário de Brasília, números alinhados, texto de fórmula preservado como texto |

**A validar em ambiente de teste com PostgreSQL (QA):** as consultas ainda não foram exercitadas contra o banco real. Roteiro, com `npm run migrate` e `npm run seed` aplicados e um token de cada perfil:

| # | Cenário | Esperado | Resultado / evidência |
|---|---|---|---|
| 1 | Cada um dos 4 relatórios em `csv` e `xlsx` (Gestor de Frota e Administrador) | `200`, arquivo abre no Excel, colunas e valores conferem com o banco | |
| 2 | Isolamento: criar um registro de abastecimento, manutenção e multa em veículo **SVO** (o seed só traz da frota administrativa) | Gestor de Frota não recebe; Administrador recebe | |
| 3 | `viagens`: existir viagem administrativa e ordem SVO | Gestor de Frota só a administrativa; Administrador as duas | |
| 4 | Período: `inicio` e `fim`; só `inicio`; só `fim`; registros nos limites (primeiro e último dia, perto da meia-noite) | Limites inclusivos, no horário de Brasília | |
| 5 | Período sem registros | `200`; CSV só com cabeçalho; XLSX só com cabeçalho e filtro `A1:..1` | |
| 6 | Período com registros | XLSX com filtro cobrindo todas as linhas | |
| 7 | Perfis sem acesso (Solicitante, Gestor SVO, motoristas) e sem token | `403` e `401` | |
| 8 | `formato`, `tipo` e datas inválidos; `inicio` > `fim` | `400` | |
| 9 | Resultado acima de 50.000 linhas (ou limite reduzido temporariamente em ambiente de teste) | `422` e nada registrado na auditoria | |
| 10 | Auditoria após cada exportação | Registro `EXPORTOU_RELATORIO ...` no módulo `RELATORIOS` | |
| 11 | Cada um dos 4 relatórios em `pdf` (Gestor de Frota e Administrador), com e sem período | `200`; abre no navegador e em um leitor de PDF; acentos, datas e valores conferem com o banco | |
| 12 | Isolamento no PDF, com os registros SVO do cenário 2 | Gestor de Frota: PDF só com frota administrativa e cabeçalho "Escopo: frota administrativa"; Administrador: as duas e "Escopo: frota administrativa e SVO" | |
| 13 | PDF sem registros no período | `200`; PDF com o cabeçalho e a mensagem "Nenhum registro encontrado" | |
| 14 | PDF com mais de 5.000 linhas (ou limite reduzido temporariamente em ambiente de teste) | `422` orientando o uso de CSV ou XLSX; nada registrado na auditoria | |
| 15 | Paginação: relatório com mais de uma página | Cabeçalho da tabela repetido, "Página X de Y" correto, nenhum registro perdido ou repetido | |

## Nota de frontend

A rota exige o token no cabeçalho, então o download não funciona com um link simples (`<a href>`).
O frontend deve chamar com `fetch` autenticado, ler o corpo como `blob` e usar o nome de `Content-Disposition` para salvar.
