# SCRUM-275 · Contrato do proxy de mapas

Base `/api/mapas`. As três operações usam GET, sessão Bearer ativa e `Cache-Control: private, no-store`. O Workbox trata `/api/` como NetworkOnly. O portal manual é independente do proxy. A integração pública das SCRUM-271 e SCRUM-272 definirá quais consultas podem ser liberadas e seu controle de abuso. Todos os endpoints desta entrega exigem sessão.

## Parâmetros e permissões

`operacao` é `ADM` (padrão) ou `SVO`. ADM exige `FASE3_MAPAS_INTERNOS`. SVO exige `FASE3_MAPAS_SVO`. Em SVO, administrador e gestor associado à unidade SVO podem usar as três rotas. Em ADM, administrador, gestor de Frota, gestor SVO e solicitante podem buscar e consultar reverso. A rota ADM fica com administrador e gestor de Frota. O proxy recebe pontos e endereços, sem acesso a registros de ocorrências ou autorização para alterá-los.

| Caminho | Parâmetros | Exemplo sintético |
| --- | --- | --- |
| `/buscar` | Exatamente um entre `q` (3–120 caracteres após normalização), `cep` (8 dígitos, hífen opcional) e `unidade` (`HEMOSE`, `LACEN`, `SVO`). | `/api/mapas/buscar?cep=01001-000` |
| `/reverso` | `lat` em [−90, 90] e `lon` em [−180, 180]. Decimais com ponto e até 12 casas. O proxy usa seis casas. | `/api/mapas/reverso?lat=-10.91&lon=-37.07` |
| `/rota` | Repita `pontos` para cada `latitude,longitude`, de origem até destino. `retornarOrigem=true` acrescenta um trecho final. ADM permite oito paradas intermediárias, com `FASE3_MULTIPLAS_PARADAS` ativa. O teto técnico do proxy é de 50 pontos, incluindo retorno, e a URL é limitada a 4 KiB. Para ponto sem coordenadas, preserve sua posição usando `pontos=`. | `/api/mapas/rota?pontos=-10.91,-37.07&pontos=-10.93,-37.06&pontos=-10.92,-37.05&retornarOrigem=true` |

O teto técnico de 50 também protege SVO e limita a carga enviada ao serviço de demonstração. A sequência SVO não herda a regra administrativa de oito paradas. O provedor pode recusar uma sequência antes desse teto. Qualquer necessidade operacional maior exige acordo de capacidade antes da ativação.

A busca textual faz normalização Unicode, remove espaços nas extremidades e unifica espaços consecutivos. Para CEP válido e existente, consulta ViaCEP e envia os campos necessários ao Photon estruturado. Sem candidatos estruturados, tenta texto com os campos do ViaCEP. Sem geocodificação após ambas as tentativas válidas, retorna endereço ViaCEP com coordenadas nulas. Busca por CEP inexistente retorna lista vazia. O viés favorece Aracaju/Sergipe mantendo resultados no restante do Brasil. O frontend deve permitir confirmação consciente quando `foraDeSergipe=true` e pedir confirmação de UF quando desconhecida. A propriedade é informativa e nunca altera a autorização.

Os aliases consultam a fonte interna antes dos provedores e retornam uma lista vazia até o adaptador da SCRUM-274 fornecer a localização institucional verificada. O contrato do adaptador aceita apenas a unidade enumerada e um `AbortSignal`. Nenhuma coordenada de unidade foi cadastrada aqui.

## Respostas

As definições TypeScript ficam em `src/backend/src/services/mapasService.ts`.

```json
{
  "resultados": [{
    "fonte": "photon",
    "logradouro": "Praça da Sé",
    "numero": null,
    "bairro": null,
    "municipio": "São Paulo",
    "estado": "São Paulo",
    "cep": null,
    "coordenadas": { "latitude": -23.55, "longitude": -46.63 },
    "foraDeSergipe": true
  }],
  "degradado": false
}
```

`fonte` pode ser `photon`, `viaCEP` ou `unidade`. Campos de texto, coordenadas e indicação de UF podem ser nulos. Um candidato é uma sugestão que o usuário deve conferir. A ausência de resultados normal retorna `200 { "resultados": [], "degradado": false }`. Em falha externa de busca, o contrato é `200 { "resultados": [], "degradado": true }`. Em ambos os casos, o cliente permite endereço manual. Uma falha externa no reverso retorna 503.

```json
{
  "aproximada": false,
  "metodo": "osrm",
  "distanciaMetros": 2510,
  "geometria": "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
  "formatoGeometria": "polyline5"
}
```

O OSRM recebe os pontos na ordem manual do cliente. Em falha técnica externa ou cota de saída local atingida, estima a distância dos trechos consecutivos com Haversine × 1,3, inclusive o retorno solicitado. A resposta traz `aproximada: true`, `metodo: "haversine_1_3"` e geometria e formato nulos. O cliente mostra o rótulo de estimativa. Um resultado definitivo do OSRM indicando ausência de rota ou ponto rodoviário, ou excedendo o limite do provedor, retorna 422.

| HTTP | Condição |
| --- | --- |
| 200 | Resposta válida, busca degradada ou estimativa devidamente identificada. |
| 400 | Entrada inválida, com `MAPAS_PARAMETROS_INVALIDOS`. |
| 401 / 403 | Autenticação ausente ou inválida, perfil não autorizado, conta inativa ou associação SVO ausente. |
| 404 | Flag desativada, com `RECURSO_DESATIVADO`, ou caminho inexistente. |
| 414 | Mais de 4 KiB na URL. |
| 422 | `ROTA_SEM_COORDENADAS` com `contexto.pontos` (índices a partir de zero), `ROTA_INDISPONIVEL` ou `ROTA_LIMITE_PROVEDOR`. |
| 429 | Cota de entrada por conta ou por IP, com `Retry-After`. Um 429 do provedor é uma falha de dependência. |
| 503 | Reverso indisponível, orçamento insuficiente ou concorrência esgotada. |

## Operação e privacidade

- `MAPAS_CACHE_ENTRADAS` aceita 500–1000, padrão 750. TTL de 24h desde a inserção e LRU de até 8 MiB de custo estimado. A chave é um hash da entrada normalizada. O armazenamento fica em memória por processo, desaparece em reinícios e não grava credenciais. Candidatos sem localização, respostas vazias, erros, resultados degradados e estimativas não são armazenados. O cache de saída HTTP é desativado.
- Tempo por chamada de 3.500 ms, inclusive leitura do corpo. O orçamento total padrão é o menor entre 10.500 ms e o timeout global menos 500 ms. `MAPAS_ORCAMENTO_MS` aceita de 200 ms até o menor entre 12.000 ms e o limite global menos 500 ms. `REQUEST_TIMEOUT_MS` tem padrão de 15.000 ms. O relógio global começa antes da autenticação. Requisições equivalentes em andamento compartilham a chamada e o último cliente a sair cancela o upstream. A busca de texto após zero resultados estruturados pertence ao mesmo orçamento.
- Até 8 consultas distintas em andamento. O rate-limit de entrada soma 20 requisições/min por conta aos limites globais da API por IP e concorrência. Por instância, os tetos de saída são 30/min ViaCEP, 60/min Photon, 30/min OSRM e pelo menos 1 s entre chamadas OSRM. Após 429, há pausa local, observando `Retry-After` numérico quando informado. Esses números são limites próprios para homologação, não cotas prometidas pelos provedores. Compartilhamento entre instâncias exige coordenação específica antes de escalar.
- HTTPS e domínios e caminhos fixos, sem redirecionamento ou repasse de cabeçalhos do cliente. JSON limitado a 384 KiB já descomprimidos e validado antes de usar. Geometria polyline5 tem limite de 256 KiB e validação de estrutura e coordenadas.
- Use `q` somente para texto de endereço. O validador rejeita campos extras, formatos de URL e e-mail, sequências de documentos/telefones e marcadores sensíveis evidentes. Nomes avulsos e outras informações podem se parecer com endereços, portanto os consumidores devem extrair somente os campos cartográficos autorizados. CPF, contato, nome de pessoas atendidas, descrições, informações clínicas e credenciais devem permanecer nos fluxos próprios. A validação institucional deve incluir o risco de endereços/coordenadas nos serviços de terceiros e em logs de borda.
- Logs do backend registram operação, cache hit/miss/deduplicação/evicção, provedor, categoria de resultado e tempo. Agregue 429, timeout e indisponibilidade sem query, cabeçalhos, endereço, identificador de registro ou coordenadas. Nenhuma dependência paga ou migration é exigida.

## Provedores e ativação

Referências consultadas em 27/11/2026.

- ViaCEP publica consulta gratuita, sem cota numérica geral informada. Uso em massa pode bloquear o acesso. [ViaCEP](https://viacep.com.br/)
- Photon público permite uso moderado, com limitação ou bloqueio em tráfego excessivo e disponibilidade sem garantia. [Photon](https://github.com/komoot/photon), [API v1](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- A instância OSRM veicular selecionada é a da FOSSGIS em `routing.openstreetmap.de`. A política exige atribuição com link para correção no mapa, User-Agent válido, no máximo uma chamada por segundo e uso leve. O operador registra as requisições de rotas, incluindo coordenadas. Os consumidores exibem atribuição de OpenStreetMap/FOSSGIS e disponibilizam o link de correção. [Política OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy), [Instância FOSSGIS](https://routing.openstreetmap.de/about.html), [API de rota](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md)

A ativação operacional requer validação institucional de finalidade, minimização e transferência de endereços/coordenadas, mais homologação de capacidade e política dos fornecedores. SCRUM-276 e SCRUM-277 consomem a busca e o reverso. SCRUM-281 e SCRUM-283 consomem os pontos ordenados e a geometria, mantendo regras por registro no fluxo operacional. A aprovação e o rollout são acompanhados pela SCRUM-296 e SCRUM-298.

As suítes `mapasService.test.ts` e `mapasRoutes.test.ts` usam mocks controlados. A segunda exercita o app Express e os middlewares reais, com identidade e upstream simulados. Os testes de prazo usam AbortSignal.

Smoke real de 27/11/2026, executado no serviço compilado com locais públicos: ViaCEP retornou o CEP de teste da Praça da Sé, Photon estruturado respondeu sem candidatos e a busca textual subsequente retornou quatro candidatos; texto direto retornou cinco candidatos e reverso retornou um. A rota sintética de dois pontos retornou 3.967 m com método OSRM e polyline5. O teste confirmou que o reverso da instância Photon rejeita o filtro de país por query; a API aplica o filtro ao resultado normalizado. Esta amostra verifica o contrato corrente. A carga e o uso institucional ficam condicionados à homologação.
