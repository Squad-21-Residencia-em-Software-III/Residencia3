# SCRUM-271 · Proteção do portal SVO

A criação e a geocodificação têm cotas de 12 requisições por minuto por IP ou prefixo IPv6. A geocodificação tem teto compartilhado de 18 por minuto para limitar chamadas ao ViaCEP e ao Photon. A criação tem teto de 40 por minuto. O portal aceita até 50 requisições por minuto e 20 por janela de 10 segundos. Esses valores iniciais devem ser medidos com tráfego de homologação, incluindo múltiplos usuários no mesmo NAT. O PostgreSQL coordena as cotas entre instâncias que compartilham o banco. Os limites simultâneos de duas consultas de mapa e quatro cadastros são por processo. Respostas 429 informam quando repetir usando o cabeçalho Retry-After.

O contador usa o IP identificado pelo caminho Vercel ou Render descrito em [Segurança HTTP](seguranca-http.md). O armazenamento transitório guarda somente chave derivada por HMAC, escopo, janela e contagem. Os registros vencidos são removidos durante requisições admitidas.

O portal aceita CEP ou coordenadas para geocodificação. Busca de texto livre, unidades e trajetos seguem no proxy interno autenticado. O mapa público exige as flags de portal e mapa SVO. O fluxo de cadastro exige a flag de portal, corpo JSON de até 100 KB e honeypot vazio ou ausente.

A SCRUM-264 fornece a transação de criação, publicação de S1 e replay persistente. O detalhe de triagem retorna um sinal de possível duplicidade para dois registros externos com o mesmo documento do falecido e a mesma data e hora da ocorrência. A comparação usa dados já armazenados e devolve somente um booleano aos perfis autorizados. As duas ocorrências permanecem na fila. A exibição do sinal no drawer depende da integração com a triagem. A consulta pública de acompanhamento da SCRUM-266 tem contrato e proteção próprios.

## Desafio antirrobô

O núcleo autohospedado do ALTCHA é gratuito, roda sem cookies ou rastreamento de terceiros e declara acessibilidade WCAG 2.2 AA. É candidato a um piloto com desafio acionado pela política do portal em caso de abuso. A FSPH precisa validar acessibilidade no fluxo completo, latência e uso de bateria em aparelhos modestos e um canal assistido para quem não conseguir responder. [Documentação do ALTCHA](https://altcha.org/docs/open-source-vs-paid/).

O Turnstile oferece plano gratuito, mas encaminha a verificação a um terceiro e exige análise do adendo de privacidade. A decisão institucional cobre a escolha, os dados tratados e a ativação. O fluxo manual continua independente do mapa. [Planos Turnstile](https://developers.cloudflare.com/turnstile/plans/) · [Adendo de privacidade](https://www.cloudflare.com/turnstile-privacy-policy/).
