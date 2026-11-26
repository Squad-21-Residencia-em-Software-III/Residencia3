# SCRUM-226: API de notificações In-App

Rotas em `/api/notificacoes`, sobre a tabela `notificacoes` (SCRUM-225). Seguem o contrato do front da SCRUM-227. Todas exigem sessão e valem para todos os perfis: cada usuário acessa **só os próprios avisos**. O usuário vem sempre da sessão, e qualquer id de usuário enviado pelo cliente é ignorado.

| Método e rota | Entrada | Resposta `200` |
|---|---|---|
| `GET /` | `limit` (1 a 50, padrão 20), `cursor`, `apenas_nao_lidas` (`true`/`false`) | `{ itens, proximo_cursor, nao_lidas, versao }` |
| `GET /contador` | — | `{ nao_lidas, versao }` |
| `PATCH /:id/lida` | — | `{ id, lida_em, nao_lidas, versao }` |
| `PATCH /ler-todas` | `ids` (opcional, até 1.000 por chamada) | `{ atualizadas, nao_lidas, versao }` |
| `PATCH /referencia/lida` | `referencia_tipo`, `referencia_id` | `{ atualizadas, nao_lidas, versao }` |

Os nomes `nao_lidas` e `proximo_cursor` correspondem a `unreadCount` e `nextCursor` da tarefa, no padrão de nomes da API.

## Regras

- **Operação por perfil:** além do dono, vale a operação do aviso, conferida a cada chamada. Administrador: as duas. Solicitante, Gestor de Frota e Motorista da frota: Administrativo. Gestor SVO: Administrativo e, se associado à unidade SVO, SVO. Motorista SVO e Integrante SVO: SVO. Assim, quem muda de perfil deixa de ver os avisos da operação anterior.
- **Acesso ao registro:** conferido a cada leitura, e não quando o aviso foi criado (tabela abaixo). Quem perdeu o acesso ainda vê que houve um aviso (`tipo`, `operacao`, datas e leitura), mas título, mensagem, severidade, referência e destino são substituídos, e vem `acesso_revogado: true`. O aviso continua contado e pode ser marcado.
- **Histórico preservado:** quem continua vinculado vê o aviso inteiro, mesmo com a viagem ou a coleta concluída ou cancelada.
- **Destino:** abrir o aviso não concede acesso. A rota do registro confere a permissão de novo.
- **Cursor:** `data UTC com microssegundos|id`. É opaco para o front e não repete nem pula itens, mesmo com datas iguais ou avisos novos entre as páginas. Cursor inválido responde `400`.
- **Leitura:** repetir é seguro e mantém a data da primeira leitura. Aviso inexistente ou de outra pessoa responde `404`, sem diferença entre os dois.
- **`nao_lidas`:** sempre contado no banco depois da alteração, por isso não fica negativo e inclui o que chegou no meio.
- **`versao`:** texto opaco, em toda resposta com contador. Muda quando chega ou se lê um aviso, mesmo com o total igual.
- **`ids`:** delimita os avisos apresentados. A API restringe a alteração aos avisos do usuário e da operação autorizada. Uma chamada sem `ids` solicita expressamente a leitura de todas as notificações já visíveis ao banco na operação.
- **Cache:** as respostas levam `Cache-Control: no-store`.

## Referências

`referencia_tipo` é o nome do registro e pertence a uma operação só. O mesmo id em tipos diferentes são registros diferentes, e `PATCH /referencia/lida` confere o tipo e a operação. Outro valor responde `400`.

| `referencia_tipo` | Operação | Quem acessa o conteúdo |
|---|---|---|
| `SOLICITACAO_VIAGEM` | Administrativo | Administrador e Gestor de Frota; Solicitante e Gestor SVO, só o que pediram |
| `VIAGEM_FROTA` | Administrativo | Administrador e Gestor de Frota; Solicitante e Gestor SVO, só do que pediram; Motorista da frota, enquanto é o condutor |
| `SOLICITACAO_SVO` | SVO | Administrador e Gestor SVO associado |
| `ORDEM_SVO` | SVO | Administrador e Gestor SVO associado; Motorista SVO, enquanto é o condutor; Integrante, com designação não revogada |

Aviso sem referência é livre para o destinatário. Tipo não cadastrado em `constants/referenciasNotificacao.ts` nunca mostra conteúdo, nem ao Administrador: um evento novo precisa cadastrar o seu.

## Para o front (SCRUM-227)

1. **Marcar todas:** enviar os `ids` dos avisos não lidos carregados, em lotes de até 1.000. Usar o `nao_lidas` da última resposta, pois outros avisos podem continuar não lidos.
2. **Sincronizar:** revalidar a lista aberta periodicamente e ao retomar o uso. A `versao` do contador acompanha as leituras e novas notificações. Revogações de acesso podem ocorrer sem alterar essa versão.
3. **`acesso_revogado`:** mostrar sem link.
4. **Tipos de referência:** usar os nomes acima no prefixo do identificador.

O filtro `ate_id` foi substituído porque a ordem de reserva de IDs pode divergir da ordem de confirmação de transações. Ele responde `400` para evitar que clientes antigos façam uma marcação sem limite por engano.

## Testes

- `notificacaoRoutes.test.ts`: sessão, perfis, validações e contrato.
- `notificacaoAcessoPostgres.test.ts`: acesso ao registro por perfil, revogação e histórico. Mesmas condições da suíte abaixo.
- `notificacaoPostgres.test.ts`: acesso cruzado, paginação, idempotência e concorrência em PostgreSQL descartável. Só roda com `SCRUM226_POSTGRES_TESTS=1`, `POSTGRES_HOST=127.0.0.1` e `POSTGRES_DB=frotas_teste`, depois de `npm run migrate`. Roda no CI.

## Atenção

O limite de leitura é de 300 consultas por minuto **por IP**. O sino consulta uma vez por minuto em cada aba visível, então muitos usuários atrás do mesmo IP somam no mesmo limite. O valor foi mantido por decisão da liderança e será validado na carga integrada da SCRUM-243 (ver `limites-e-timeouts.md`).
