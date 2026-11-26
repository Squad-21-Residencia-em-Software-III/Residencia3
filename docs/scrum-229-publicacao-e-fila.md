# SCRUM-229: publicação de avisos e fila de push

Base para as tarefas de eventos (SCRUM-230 a 235) e para o envio (SCRUM-237). Usa as tabelas `notificacoes` (225), `notificacao_outbox` (228), `push_subscriptions` e `preferencias_notificacao` (236). Sem migration e sem dependência nova.

**Nada é enviado ainda:** a fila só trabalha depois que a SCRUM-237 registrar o enviador, e nenhum serviço publica eventos nesta tarefa.

## Publicar um aviso (SCRUM-230 a 235)

`services/publicacaoNotificacoes.ts`, sempre **dentro da transação da operação**:

```ts
await publicarNotificacao(trx, {
  tipo: 'VIAGEM_REAGENDADA',
  operacao: 'Administrativo',
  titulo: 'Viagem reagendada',
  mensagem: 'Nova saída às 15:00.',
  urlDestino: '/viagens',
  referencia: { tipo: 'VIAGEM_FROTA', id: viagem.id },
  ocorrencia: String(auditoriaDaReprogramacao.id),
  autorId: autor.id,
  destinatarios: [motoristaUsuarioId],
  push: { categoria: 'VIAGENS', titulo: 'Viagem reagendada', corpo: 'Confira o novo horário.', tag: `viagem-${viagem.id}` },
});
```

Os valores acima são **exemplo**: tipos, textos e categorias vêm do plano.

- **Tudo ou nada:** aviso e pendência de push são gravados com a operação. Se ela for desfeita, nada fica. Uma falha ao publicar desfaz a operação; uma falha de envio, não.
- **Destinatários:** quem chama escolhe, conforme a regra do evento. Autor, inativos e repetidos são descartados. `autorId: null` só em rotina do sistema.
- **`ocorrencia`** (até 60 caracteres): distingue ocorrências legítimas do mesmo evento no mesmo registro. Repetir a mesma não avisa de novo. Use o ID persistido de auditoria ou a versão da transição. Um horário pode se repetir em alterações distintas.
- **Destinos ou canais diferentes no mesmo evento:** chamar uma vez por grupo. Quem estiver em dois grupos recebe um aviso só, o da primeira chamada.
- **Sem `push`:** o aviso fica só no sistema.
- **Textos:** cortados em 120/280 no sistema e 45/110 no push. O push aparece na tela bloqueada: **sem dado pessoal nem sensível**. Isso é responsabilidade de quem publica.
- **`categoria`:** igual à de `preferencias_notificacao`, no formato `[A-Z][A-Z0-9_]+`.

## Enviar o push (SCRUM-237)

A 237 registra o enviador ao iniciar o servidor. É o que liga a fila:

```ts
definirEnviadorPush(async ({ endpoint, p256dh, auth }, payload, sinal) => ({ status: 201 }));
```

- Responde o status HTTP do serviço de push e, se houver, `retryAfterSegundos`. A biblioteca `web-push` rejeita em respostas de erro: converter para `{ status }`. Só erro de rede deve rejeitar.
- `payload`: `{ notificacao_id, titulo, corpo, url, tag? }`. É o que o service worker (SCRUM-239) recebe.
- `sinal` é cancelado em 10 segundos.

A fila cuida do resto:

| Situação | O que acontece |
|---|---|
| 2xx | Enviado; zera as falhas da assinatura |
| 404, 410 | Assinatura passa a `EXPIRADA`; as outras do usuário continuam |
| 408, 429, 5xx, rede ou tempo esgotado | Nova tentativa em 30 s, 1, 2 e 4 min (com variação de 20%), respeitando o `Retry-After` até 1 hora; 5 tentativas no total |
| Outros 4xx | Falha definitiva, sem repetir |
| Um aparelho recebeu e outro falhou | Só repete no que faltou |
| Categoria desligada ou sem escolha, usuário inativo, sem assinatura | Ignorado. Conferido **na hora do envio** |
| Mais de 24 horas na fila | Ignorado. O aviso continua no sistema |

Os IDs internos em entregues, definitivas e expiradas ficam no outbox e são removidos do payload enviado. O código ENTREGA_PARCIAL diferencia uma entrega parcial do sucesso integral. Antes do envio, a fila reavalia o acesso atual ao registro com a política In-App da SCRUM-226. O rollout de publicação usa NOTIFICACOES_ATIVAS, desligada por padrão.

## Execução

- **Sem varredura fixa:** consultar o banco de tempos em tempos manteria o Neon acordado. A fila roda ao registrar o enviador (retoma o que uma parada deixou), depois do commit, na hora da próxima tentativa e de carona em uma requisição, no máximo uma vez por minuto. A carona pega itens criados por outro processo, como a rotina de expiração.
- **Servidor suspenso (Render Free):** a fila espera o servidor acordar. Um alerta com mais de 24 horas não é enviado.
- **Concorrência:** cada item é reservado por 2 minutos com `FOR UPDATE SKIP LOCKED`. Reserva de processo que caiu vence e volta, e quem a perdeu não sobrescreve o resultado.
- **Garantia:** ao menos uma vez. Se o processo cair entre o envio e o registro, o alerta pode repetir. A `tag` faz o novo substituir o antigo.
- **Log:** só códigos e totais, sem endpoint, usuário ou texto.

## Testes

- `filaPush.test.ts`: resultados, tentativas, isolamento, log e execução no servidor.
- `filaPushPostgres.test.ts`: transação, repetição, concorrência, reservas e preferências. Só roda com `SCRUM229_POSTGRES_TESTS=1`, `POSTGRES_HOST=127.0.0.1` e `POSTGRES_DB=frotas_teste`, depois de `npm run migrate`. Roda no CI.
