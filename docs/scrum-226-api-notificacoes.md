# SCRUM-226: API de notificações In-App

Rotas em `/api/notificacoes`, sobre a tabela `notificacoes` (SCRUM-225). Seguem o contrato do front da SCRUM-227. Todas exigem sessão e valem para todos os perfis: cada usuário acessa **só os próprios avisos**. O usuário vem sempre da sessão, e qualquer id de usuário enviado pelo cliente é ignorado.

| Método e rota | Entrada | Resposta `200` |
|---|---|---|
| `GET /` | `limit` (1 a 50, padrão 20), `cursor`, `apenas_nao_lidas` (`true`/`false`) | `{ itens, proximo_cursor, nao_lidas, versao }` |
| `GET /contador` | — | `{ nao_lidas, versao }` |
| `PATCH /:id/lida` | — | `{ id, lida_em, nao_lidas, versao }` |
| `PATCH /ler-todas` | `ate_id` (opcional) | `{ atualizadas, nao_lidas, versao }` |
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
- **`ate_id`:** id mais novo que o usuário viu. Sem ele, `ler-todas` marca também os avisos que chegaram depois da última consulta da tela.
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

1. **Marcar todas:** enviar `ate_id` com o maior id carregado na lista e usar o `nao_lidas` da resposta, em vez de assumir zero.
2. **Sincronizar:** guardar a última `versao` recebida em qualquer resposta. Se o `GET /contador` trouxer outra e a lista estiver aberta, recarregar a primeira página. A própria ação não causa recarga, porque a resposta dela já traz a versão nova.
3. **`acesso_revogado`:** mostrar sem link.
4. **Tipos de referência:** usar os nomes acima no prefixo do identificador.

Limite conhecido: o id é reservado quando a operação começa. Um aviso de uma operação que ainda não terminou pode ter id menor que o `ate_id` e ser marcado ao aparecer. A janela é o tempo de uma transação.

## Testes

- `notificacaoRoutes.test.ts`: sessão, perfis, validações e contrato.
- `notificacaoAcessoPostgres.test.ts`: acesso ao registro por perfil, revogação e histórico. Mesmas condições da suíte abaixo.
- `notificacaoPostgres.test.ts`: acesso cruzado, paginação, idempotência e concorrência em PostgreSQL descartável. Só roda com `SCRUM226_POSTGRES_TESTS=1`, `POSTGRES_HOST=127.0.0.1` e `POSTGRES_DB=frotas_teste`, depois de `npm run migrate`. Roda no CI.

## Atenção

O limite de leitura é de 300 consultas por minuto **por IP**. O sino consulta uma vez por minuto em cada aba visível, então muitos usuários atrás do mesmo IP somam no mesmo limite. O valor foi mantido por decisão da liderança e será validado na carga integrada da SCRUM-243 (ver `limites-e-timeouts.md`).
