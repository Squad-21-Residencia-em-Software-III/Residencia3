# SCRUM-196: progresso e pendências

Base analisada: `develop` no commit `ea08d75`. Esta implementação está incompleta e não deve ser homologada ou integrada como entrega da história.

## Alteração em andamento

A consulta de disponibilidade, a validação do agendamento e a reavaliação da fila deixam de exigir registros em `escalas_svo`. As consultas existentes de reservas e de ocupação de equipe, veículo e motorista permanecem. A tabela de escalas e seus dados não foram alterados. A verificação PostgreSQL está pendente.

A área Equipe permite ao Administrador e ao Gestor SVO listar, criar e renomear equipes existentes, com validação de nome, resposta de conflito e auditoria. As APIs são `GET /api/equipes-svo`, `GET /api/equipes-svo/:id`, `POST /api/equipes-svo` e `PATCH /api/equipes-svo/:id`; criação e edição recebem `{ "nome_equipe": "..." }`. As operações de escrita usam uma trava transacional compartilhada entre essas rotas para verificar duplicidade, mas isso não substitui um índice único no banco para garantir integridade diante de outros clientes. Não há remoção de equipe.

## Trabalho ainda necessário

- Contas individuais `INTEGRANTE_SVO`, vínculos múltiplos, autorização específica e auditoria das operações de integrantes.
- Designação por coleta, limite da cabine, verificações de vínculo, conflitos individuais e concorrência, modificações antes do início real e preservação do histórico.
- Consulta restrita das próprias coletas e interface correspondente.
- Modelagem e migration de vínculos e designações, definição de índices e constraints, integração com schema existente e testes em PostgreSQL isolado. A estrutura ainda não foi definida nem implementada.
- Integração dos conflitos individuais também com a liberação da fila, além de testes de regressão e homologação de ponta a ponta. Até isso estar pronto a alteração de disponibilidade não satisfaz todos os critérios da SCRUM-196.

Não foi executado SQL, migration ou alteração em banco compartilhado. A validação completa depende também das demais alterações da história e de suas dependências de agenda e fila SVO.
