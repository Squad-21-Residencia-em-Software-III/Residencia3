# SCRUM-232 · Avisos de exceção de odômetro

A9 avisa administradores e gestores de frota ativos sobre a solicitação. A10 avisa o motorista da frota que fez o pedido sobre a decisão. O serviço usa `VIAGEM_FROTA` para autorização e leitura contextual, e usa a fase, o ID da exceção e o evento para deduplicação.

A justificativa resumida aparece na central autenticada enquanto o destinatário tem acesso à viagem. O Push usa a categoria ODOMETRO e contém texto fixo. `NOTIFICACOES_ATIVAS` controla os avisos, independentemente de `EXCECOES_ODOMETRO_ATIVAS`. O fluxo de exceções do SVO permanece disponível conforme a configuração própria. A publicação de S8 pertence à SCRUM-235.
