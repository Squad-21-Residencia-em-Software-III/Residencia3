# SCRUM-296 · Implantação gradual da Fase 3

## Configuração

O backend resolve as flags em `src/backend/src/config/fase3.ts`, ao iniciar. Os valores são `true` e `false`. Ausência ou valor vazio equivale a `false`. Um valor inválido fecha o recurso e gera `FASE3_CONFIG_BLOQUEADA` com o nome da variável. O mesmo evento indica dependências ausentes. Alterar o backend exige reinício. A configuração do Vite exige novo build. Os dois exemplos de ambiente documentam todas as chaves.

| Recurso | Variável no servidor | Pré-condições e integração |
| --- | --- | --- |
| Mapas internos | `FASE3_MAPAS_INTERNOS` | Proxy na SCRUM-275 e mapa na SCRUM-276. |
| Múltiplas paradas ADM | `FASE3_MULTIPLAS_PARADAS` | Roteiro e regras de autorização na SCRUM-281. |
| Mapas e roteiros SVO | `FASE3_MAPAS_SVO` | Proxy, infraestrutura cartográfica e roteiro SVO nas SCRUM-275, 276 e 283. |
| Portal público manual | `FASE3_PORTAL_SVO` | Triagem, privacidade e proteção contra abuso nas SCRUM-264, 271 e 272. Independe dos mapas. |
| Acompanhamento externo | `FASE3_ACOMPANHAMENTO_EXTERNO` | Credencial e contrato da SCRUM-266. Pode seguir ligado com novas entradas suspensas. |
| GPS obrigatório | `FASE3_GPS_OBRIGATORIO` | Checkpoints e evidências operacionais homologados. |
| Emergência GPS | `FASE3_EMERGENCIA_GPS` | GPS obrigatório e `FASE3_EMERGENCIA_GPS_AUTORIZADA`. A aplicação verifica o gestor e o marco nas tarefas do fluxo GPS. |
| Captura periódica | `FASE3_CAPTURA_PERIODICA` | Contrato de captura e avaliação de privacidade na SCRUM-291. |
| Confirmação automática | `FASE3_CONFIRMACAO_AUTOMATICA` | Múltiplas paradas, captura periódica e `FASE3_PARAMETROS_CONFIRMACAO_HOMOLOGADOS`. |
| Retenção GPS | `FASE3_RETENCAO_GPS` | `FASE3_RETENCAO_GPS_INVENTARIO_VALIDADO`, `FASE3_RETENCAO_GPS_SIMULACAO_VALIDADA` e `FASE3_RETENCAO_GPS_AUTORIZADA`. Execução a cargo da SCRUM-295. |
| Retenção externa | `FASE3_RETENCAO_EXTERNA` | `FASE3_RETENCAO_EXTERNA_INVENTARIO_VALIDADO`, `FASE3_RETENCAO_EXTERNA_SIMULACAO_VALIDADA` e `FASE3_RETENCAO_EXTERNA_AUTORIZADA`. Execução a cargo da SCRUM-295. |

Todas as chaves acima começam desativadas, inclusive no ambiente produtivo. A aprovação é registrada no Jira ou no canal institucional antes de configurar sua chave. A homologação deve identificar a versão dos parâmetros, dados de simulação e responsável pela decisão.

O frontend expõe apenas os nove controles de visibilidade por meio de `recursoAtivo` e do prefixo `VITE_`. Os serviços de retenção e as chaves de homologação ficam no backend. Uma UI com flag ativa deve tratar `RECURSO_DESATIVADO` ou falhas do proxy e oferecer a entrada manual. A autorização do backend continua valendo por ação, registro e unidade. Conecte `exigirRecursoFase3` depois da autenticação/autorização nas novas operações de entrada. Quando a rota atende mais de um recurso, passe apenas as flags elegíveis para aquela operação.

## Desativação e recuperação

- Desligue primeiro a entrada afetada no backend. Mantenha a leitura, a credencial de acompanhamento e o endereço manual disponíveis aos usuários autorizados. Ajuste a visibilidade no frontend em seguida. Clientes antigos podem receber `404 RECURSO_DESATIVADO` ao tentar abrir um recurso novo. Evite condicionar a tela de conclusão ao estado atual da flag de entrada.
- Na saída, os futuros fluxos de viagem devem persistir a política efetiva e a versão do roteiro junto à viagem. Para um registro em andamento, carregue a política de saída pelo servidor e use `politicaViagemFase3`; preserve evidências, paradas e operações de conclusão autorizadas. Um registro anterior à Fase 3 segue a política legada. Mudanças de roteiro exigem as regras e a auditoria da modalidade. Emergências continuam sujeitas à aprovação vigente, com revisão dos registros já autorizados.
- O teste da política cobre desligamento com viagem ativa em um contrato simulado. A comprovação ponta a ponta precisa dos fluxos persistidos das SCRUM-281, 283, 288 e 291 e da homologação SCRUM-297. Nenhuma rotina de captura, portal ou expurgo é iniciada por esta infraestrutura.
- Para erro em produção, mantenha os dados e confirme se o cliente e o servidor anteriores leem o schema atual. Prefira roll-forward quando a reversão do código quebrar essa compatibilidade. Para perda de dados, restaure em instância isolada, confira integridade e reconcilie operações posteriores ao ponto de recuperação antes de trocar conexões. Consulte a [política de backup](politica-backup-e-recuperacao-db.md).

## Migrations e implantação

A SCRUM-296 e o proxy da SCRUM-275 dispensam DDL. Para futuras integrações, valide em PostgreSQL vazio e em upgrade com dados sintéticos previamente populados. Confirme branch, destino, privilégios da role de migration separados da role da aplicação e ponto de recuperação restaurável. Em `src/backend`, rode `npm run migrate:status`, execute `npm run migrate` para a sequência aprovada e repita o status. Confira colunas, índices, constraints, grants e registros preexistentes. Em falha parcial, confira locks, histórico Knex e estado efetivo antes de retomar. Implante código compatível com o schema e valide autenticação, fluxos ADM/SVO, Push e fechamento de viagem antes de habilitar uma fatia homologada. Mantenha expansão e remoção de schema em versões distintas durante a transição.

## Infraestrutura e limites

Conferência na `develop` em `361ed10` e fontes oficiais de 27/11/2026.

| Componente | Evidência e limite |
| --- | --- |
| Render | O conector identificou `fsph-api` no plano Free, branch `main`. O serviço gratuito adormece após 15 min sem entrada e pode levar cerca de um minuto para voltar. São 750 horas gratuitas mensais por workspace, storage local efêmero e cotas de banda e pipeline. O Render orienta usar Free fora de produção. Confira o uso e a forma de bloqueio por cota no workspace antes de homologar. [Render Free](https://render.com/docs/free) |
| Vercel | `src/frontend/vercel.json` reescreve `/api` para o backend antes do fallback SPA. O Hobby é limitado a uso pessoal ou não comercial. A elegibilidade do uso institucional é decisão pendente, incluindo as cotas aplicáveis ao projeto. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Termos, seção 4](https://vercel.com/legal/terms#4-hobby-plan) |
| Neon | A oferta Free consultada publica 100 CU-h/mês, 1 GB de storage e 5 GB/mês de transferência por projeto, suspensão do compute por cota e scale-to-zero após 5 min ocioso. A oferta é gratuita sem cartão. Confira o plano e saldo do projeto real, a janela efetiva de recuperação e a adequação aos dados institucionais. [Planos Neon](https://neon.com/docs/introduction/plans), [Limites publicados](https://neon.com/pricing) |
| Tiles | OpenFreeMap Liberty nas tarefas da cartografia. A instância pública é gratuita, sem cadastro ou limite de visualizações publicado, sustentada por doações. Preserve atribuição e valide disponibilidade com tráfego sintético. [OpenFreeMap](https://openfreemap.org/) |
| Segurança e CI | `.github/workflows/ci-cd.yml` executa testes, builds, auditoria e PostgreSQL descartável. `src/backend/knexfile.js` separa conexão/privilégios e timeouts. CORS vem de `config/segurancaHttp.ts` e `config/env.ts`; `middlewares/identificarCliente.ts` usa a cadeia `TRUST_PROXY` e valida `x-proxy-secret` no caminho Vercel. Valide rotas direta e proxy com as origens reais autorizadas, sem registrar segredos. `src/frontend/src/sw.ts` usa `NetworkOnly` para `/api/`. Confira [limites da API](limites-e-timeouts.md) e [segurança HTTP](seguranca-http.md). |

## Monitoramento e capacidade

- Render, janela de 04h30 de 26/11 a 04h30 de 27/11 no horário de Fortaleza: seis amostras horárias de memória entre 66,4 e 76,3 MiB, com limite de 512 MiB. Custo de cache da fase nova, latência HTTP e quantidade de requisições não foram medidos nessa série. No ambiente de homologação, após período ocioso, meça até a primeira resposta válida de `/api/status` no caminho Vercel e compare a requisição subsequente. Confirme também RSS, quantidade por status e 429 em uma sessão sintética de uso normal. Separe uma resposta do proxy de uma confirmação real gravada no banco.
- Os logs HTTP existentes registram duração, status e ID aleatório sem a query. O proxy da SCRUM-275 acrescenta sinais categóricos de cache, falha, timeout e 429 externo. Conte eventos e latências por operação/provedor no intervalo. Nunca inclua query, corpo externo, CEP buscado, coordenadas, CPF, endereços ou dados clínicos no diagnóstico. Teste a queda separada de cada provedor e do serviço de tiles.
- Confirme no painel Neon espaço usado e cotas. Em homologação, calcule bytes por ponto pela diferença de `pg_total_relation_size` da futura tabela após inserir uma amostra sintética representativa, incluindo índices. Projeção = viagens/dia × minutos ativos/viagem × (60 ÷ intervalo em segundos) × dias retidos × bytes por ponto. Cenário ilustrativo: 20 viagens/dia × 60 minutos × 4 pontos/min × 30 dias × 256 B ≈ 35 MiB, antes de folga, tabelas relacionadas e recuperação. Frequência, retenção, capacidade livre real e tamanho por ponto seguem pendentes de medida e homologação.
- O portal recebe a qualquer hora somente enquanto o caminho Vercel → Render → Neon está disponível. Cold start, suspensão por cota e falhas de rede podem impedir a gravação e a entrega do protocolo; o portal só deve confirmar recepção após persistência. A triagem não equivale a atendimento em tempo real. Ativação institucional continua bloqueada até validação escrita de elegibilidade, privacidade, disponibilidade e canal de contingência. Os testes de capacidade usam dados sintéticos e serviços gratuitos autorizados.
