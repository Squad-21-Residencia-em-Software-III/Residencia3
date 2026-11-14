# BL35 — Exportação de relatórios gerenciais em Excel/CSV

Escopo: subtarefa **[BE] Implementar exportação Excel/CSV** da história BL35 (RF18 e RN20).
A geração em PDF é uma subtarefa separada e reutiliza `relatorioService.gerar` (ver "Integração com o PDF").

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
| `formato` | query | sim | `csv`, `xlsx` |
| `inicio` | query | não | data `AAAA-MM-DD`, inclusiva |
| `fim` | query | não | data `AAAA-MM-DD`, inclusiva (deve ser ≥ `inicio`) |

Respostas:

| Status | Quando |
|---|---|
| `200` | Arquivo anexado (`Content-Disposition: attachment; filename="relatorio-<tipo>-AAAA-MM-DD.<ext>"`) |
| `400` | `tipo`, `formato` ou datas inválidos, ou período invertido |
| `401` | Sem token ou token inválido |
| `403` | Perfil sem acesso |
| `422` | O resultado passa de 50.000 linhas: reduza o período |

Tipos de conteúdo: `text/csv; charset=utf-8` e `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
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
| Administrador | Todos os relatórios; `viagens` inclui administrativas **e** SVO |
| Gestor de Frota | Todos os relatórios; `viagens` inclui **apenas administrativas** (mesmo escopo de `TIPOS_POR_PERFIL` em `viagemService`) |
| Demais perfis | `403` |

A restrição é aplicada na rota (`autorizar`) e de novo no service, sem depender do frontend.
Dados pessoais da população atendida pelo SVO (`dados_solicitante`) não fazem parte de nenhum relatório.

## Formato dos arquivos

- **CSV:** UTF-8 com BOM, separador `;`, quebra de linha CRLF, datas `dd/mm/aaaa`, decimais com vírgula. Abre com acentos corretos no Excel em português.
- **XLSX:** uma aba com cabeçalho em negrito, cabeçalho fixo, filtro, larguras ajustadas, datas e números tipados (não texto).
- **Proteção contra injeção de fórmula:** no CSV, texto livre iniciado por `=`, `+`, `-`, `@`, tab ou CR recebe um `'` na frente. No XLSX o texto é gravado como texto literal.
- Cada exportação é registrada na auditoria (módulo `RELATORIOS`), com tipo, formato, quantidade de linhas e período.

## Decisões a registrar pela equipe

A documentação do projeto exige "relatórios gerenciais em PDF e Excel/CSV" (RN20), mas não define quais relatórios existem nem o formato exato. Foram assumidos os pontos abaixo; **precisam de confirmação do Product Owner/equipe**:

1. **Catálogo inicial:** viagens, abastecimentos, manutenções e multas. Veículos e motoristas ficaram de fora por não terem período natural; podem ser acrescentados em `DEFINICOES` (`relatorioService.ts`) e `relatorioModel.ts`.
2. **Escopo do Gestor de Frota em `viagens`:** somente administrativas, para manter a regra já usada em `/api/viagens`.
3. **CSV com `;` e vírgula decimal**, pensando no Excel em pt-BR.
4. **Limite de 50.000 linhas** por exportação (`LIMITE_LINHAS_EXPORTACAO`).
5. **Auditoria das exportações**, por incluir dados operacionais e nomes de pessoas.

## Integração com o PDF

`relatorioService.gerar(tipo, periodo, autor)` devolve uma `TabelaExportavel` (título, colunas e linhas) independente de formato.
Para acrescentar o PDF: incluir `'pdf'` em `FORMATOS_EXPORTACAO` (`constants/relatorios.ts`), criar o gerador a partir da mesma tabela e registrá-lo no mapa `FORMATOS` de `relatorioService.ts`.
Enquanto isso, `formato=pdf` responde `400`.

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
| Respeita o perfil | Solicitante, Gestor SVO ou motorista chama a rota | `403`, sem consulta nem auditoria |
| Respeita o escopo de viagens | Gestor de Frota exporta `viagens` | Nenhuma linha com tipo `SVO` |
| Período | `inicio` e `fim` de um mês | Somente registros daquele período |
| Sem sessão | Chamada sem token | `401` |

## Nota de frontend

A rota exige o token no cabeçalho, então o download não funciona com um link simples (`<a href>`).
O frontend deve chamar com `fetch` autenticado, ler o corpo como `blob` e usar o nome de `Content-Disposition` para salvar.
