# Logs técnicos e correlação

Cada resposta recebe `X-Request-ID`. Um identificador recebido é aceito apenas no formato UUID (36 caracteres, versão e variante válidas); outros valores são substituídos por um UUID gerado pelo servidor. Um UUID fornecido pelo cliente não prova sua identidade ou origem: proxies confiáveis devem substituí-lo na borda se for necessária proveniência confiável. Não use esse identificador para autorização.

Os logs HTTP são JSON com horário, nível, identificador, método, indicação de rota reconhecida ou não, status e duração. Não incluem URL, parâmetros, cabeçalhos, corpo ou texto de exceção. Erros internos e falhas de status usam códigos fixos e o mesmo identificador. A falha de gravação da auditoria de autenticação é registrada com código fixo, sem dados da exceção; esse evento de serviço não possui identificador HTTP.

A auditoria formal BL04 continua independente dos logs técnicos. Os erros operacionais preservam seus códigos e contextos para o cliente autorizado, inclusive o desafio de confirmação da agenda SVO; esses contextos não são escritos no log.
