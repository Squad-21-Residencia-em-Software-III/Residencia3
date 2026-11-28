# SCRUM-271 · Proteção do portal SVO

A criação e a geocodificação têm cotas de 12 requisições por minuto por IP ou prefixo IPv6. A geocodificação tem teto compartilhado de 18 por minuto para limitar chamadas ao ViaCEP e ao Photon. A criação tem teto de 40 por minuto. O portal aceita até 50 requisições por minuto e 20 por janela de 10 segundos. Esses valores iniciais devem ser medidos com tráfego de homologação, incluindo múltiplos usuários no mesmo NAT. O PostgreSQL coordena as cotas entre instâncias que compartilham o banco. Os limites simultâneos de duas consultas de mapa e quatro cadastros são por processo. Respostas 429 informam quando repetir usando o cabeçalho Retry-After.

O contador usa o IP identificado pelo caminho Vercel ou Render descrito em [Segurança HTTP](seguranca-http.md). O armazenamento transitório guarda somente chave derivada por HMAC, escopo, janela e contagem. As requisições admitidas removem até 50 registros vencidos por vez, pulando linhas já bloqueadas.

O portal aceita CEP ou coordenadas para geocodificação. Busca de texto livre, unidades e trajetos seguem no proxy interno autenticado. O mapa público exige as flags de portal e mapa SVO. O fluxo de cadastro exige a flag de portal, corpo JSON de até 100 KB e honeypot vazio ou ausente.

A SCRUM-264 fornece a transação de criação, publicação de S1 e replay persistente. O detalhe de triagem retorna um sinal de possível duplicidade para dois registros externos com o mesmo documento do falecido e horários da ocorrência com diferença de até cinco minutos. A comparação usa dados já armazenados e devolve somente um booleano aos perfis autorizados. As duas ocorrências permanecem na fila. A exibição do sinal no drawer depende da integração com a triagem. O acompanhamento da SCRUM-266 tem flag independente. Suas duas rotas dividem uma cota adicional de 40 requisições por minuto, quatro requisições em andamento por processo e o limite global do portal. O limite por IP de tentativas de credencial permanece com a SCRUM-266, para que consultas válidas de hospitais sob NAT não consumam aquela cota de falhas.

A recuperação de comprovantes depende da flag do portal e compartilha os tetos do portal, com cota adicional de 30 requisições por minuto. O limite local de geocodificação é mantido até o término do processamento mesmo que a conexão seja interrompida. A ligação da mesma proteção ao ciclo dos controladores de cadastro, consulta e recuperação depende da integração com as entregas de cadastro e credenciais.

## Desafio antirrobô

O núcleo autohospedado do ALTCHA é gratuito, roda sem cookies ou rastreamento de terceiros e declara acessibilidade WCAG 2.2 AA. É candidato a um piloto com desafio acionado pela política do portal em caso de abuso. A FSPH precisa validar acessibilidade no fluxo completo, latência e uso de bateria em aparelhos modestos e um canal assistido para quem não conseguir responder. [Documentação do ALTCHA](https://altcha.org/docs/open-source-vs-paid/).

O Turnstile oferece plano gratuito, mas encaminha a verificação a um terceiro e exige análise do adendo de privacidade. A decisão institucional cobre a escolha, os dados tratados e a ativação. O fluxo manual continua independente do mapa. [Planos Turnstile](https://developers.cloudflare.com/turnstile/plans/) · [Adendo de privacidade](https://www.cloudflare.com/turnstile-privacy-policy/).
