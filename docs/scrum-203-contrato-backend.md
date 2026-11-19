# SCRUM-203: contrato das fotos do odômetro (front → back, banco e DevOps)

O frontend expõe os controles com `VITE_FOTOS_ODOMETRO_ATIVAS=true`. A API informa a disponibilidade e obrigatoriedade das fotos e a disponibilidade de exceções. A configuração tem [implantação coordenada](operacao-odometro-e-agenda-svo.md).

Regras de negócio: decisões do líder de 18/11/2026 na SCRUM-203.

## Visão geral do fluxo

1. O motorista informa o km e escolhe a foto ("Tirar foto agora" ou "Carregar foto").
2. O front **envia a foto primeiro** (`POST /evidencias-odometro`) e recebe um `id` provisório.
3. O front chama `PATCH /viagens/:id/iniciar` ou `/finalizar` com o km e o `evidencia_id`.
4. O back valida tudo **na mesma transação** da transição e só então confirma a foto. Sem foto válida (ou exceção autorizada), não há transição.

Se a transição falhar por outro motivo (por exemplo, km menor que o atual), o front **reaproveita** o mesmo `evidencia_id` na nova tentativa, sem reenviar a foto.

## 1. Enviar a foto: `POST /api/evidencias-odometro` (SCRUM-208)

`multipart/form-data`:

| Campo | Tipo | Observação |
|---|---|---|
| `tipo_operacao` | `ADMINISTRATIVA` \| `SVO` | ids das duas tabelas podem coincidir |
| `viagem_id` | inteiro | id da viagem administrativa ou da ordem SVO |
| `fase` | `SAIDA` \| `CHEGADA` | |
| `chave_idempotencia` | string (UUID) | o mesmo valor num reenvio deve devolver a **mesma** evidência, sem duplicar |
| `arquivo` | arquivo | JPEG, PNG ou WebP; o front limita a 10 MB e recusa HEIC |

Resposta `201`:

```json
{ "id": "3f6c…", "fase": "SAIDA", "expira_em": "2026-11-18T12:30:00Z" }
```

- `id` opaco (UUID), nunca o caminho do arquivo.
- A foto fica **provisória** até a transição usá-la; as provisórias não usadas são limpas depois de `expira_em`.

Regras no back:
- Só o motorista vinculado à viagem/ordem, no status certo da fase.
- Conferir o tipo real pelo conteúdo (assinatura do arquivo), tamanho máximo e nome seguro; calcular o SHA-256.
- Nada de base64 em log, auditoria ou JSON da viagem.

Erros esperados pelo front: `400` (arquivo inválido), `403`, `404`, `409` (fase já registrada), `413` (arquivo grande demais). O front mostra o `erro` da resposta.

## 2. Transição com a foto: `PATCH /viagens/:id/iniciar` e `/finalizar` (SCRUM-208)

Os corpos atuais ganham **um campo**:

```json
{ "tipo_operacao": "SVO", "km_inicial": 35000, "evidencia_id": "3f6c…" }
{ "tipo_operacao": "SVO", "km_final": 35120, "evidencia_id": "9a1d…" }
```

O back precisa validar que a evidência:
- existe e é provisória (ainda não usada);
- pertence à **mesma** viagem, ao mesmo tipo, à mesma fase e ao mesmo motorista que está fazendo a transição.

Depois, confirma a foto, grava o km e registra a auditoria, **tudo na mesma transação**. Sem `evidencia_id`, só passa se a fase já estiver coberta (ver seções 4 e 5).

Quando o problema é a foto, o erro deve trazer `codigo`. Com esses códigos, o front descarta o id e envia a foto de novo:

| `codigo` | Quando |
|---|---|
| `EVIDENCIA_OBRIGATORIA` | sem `evidencia_id` e sem exceção autorizada |
| `EVIDENCIA_INVALIDA` | id de outra viagem/fase/usuário, já usado ou inexistente |
| `EVIDENCIA_EXPIRADA` | a foto provisória passou de `expira_em` |

Qualquer outro erro mantém o id para a próxima tentativa.

## 3. Consultar as fotos: `GET /evidencias-odometro?tipo_operacao=SVO&viagem_id=12` (SCRUM-209)

Usado pelos modais (para saber se a foto ainda é necessária) e pelas telas de consulta.

```json
{
  "tipo_operacao": "SVO",
  "viagem_id": 12,
  "veiculo_placa": "SVO1A23",
  "motorista_nome": "Ana",
  "saida":   { "id": "3f6c…", "fase": "SAIDA", "situacao": "REGISTRADA", "km": 35000,
               "registrada_em": "2026-11-18T08:00:00Z", "autor_nome": "Ana",
               "compartilhada": false, "excecao": null, "pode_baixar": true },
  "chegada": { "id": null, "fase": "CHEGADA", "situacao": "PENDENTE", "km": null,
               "registrada_em": null, "autor_nome": null, "compartilhada": false,
               "excecao": null, "pode_baixar": false }
}
```

`situacao`:

| Valor | Significado | No front |
|---|---|---|
| `PENDENTE` | a fase ainda não aconteceu | pede a foto |
| `REGISTRADA` | foto confirmada | mostra a foto; no modal, **não pede de novo** |
| `EXCECAO_AUTORIZADA` | gestor autorizou sem foto (`excecao` preenchido) | mostra quem, quando e a justificativa; deixa a transição seguir sem foto |
| `EXPIRADA` | descartada após 12 meses | "foto descartada após o prazo de guarda" |
| `SEM_REGISTRO` | viagem anterior a esta funcionalidade | "registro anterior, sem evidência" |

`excecao`: `{ "justificativa": "...", "autorizada_por_nome": "...", "autorizada_em": "..." }`.

Permissão (decisão do líder): consultar **não** abre a Auditoria geral para os gestores.

| Perfil | Pode ver |
|---|---|
| Administrador | as duas operações |
| Gestor de Frota | só as viagens administrativas |
| Gestor SVO | só as coletas SVO |
| Motoristas, integrantes e demais | **403** |

A checagem é por registro (tipo + id), contra IDOR/BOLA.

## 4. Arquivo da foto: `GET /evidencias-odometro/:id/arquivo[?download=1]` (SCRUM-209/211)

- Devolve os bytes da imagem por **proxy autenticado** (mesma regra de permissão da consulta), com `Cache-Control: no-store` e `Content-Type` correto.
- Com `download=1`, inclui `Content-Disposition: attachment`. O botão "Baixar original" só aparece quando `pode_baixar` é `true`.
- Nunca usar link público ou duradouro. Uma URL assinada curtíssima também funciona, desde que gerada por este endpoint.
- Registrar na auditoria a consulta e o download, sem colocar URL ou imagem em `auditorias.acao`.

## 5. Coletas SVO com um só deslocamento físico

Quando várias ordens compartilham o mesmo deslocamento, a foto de saída e a de chegada são **as mesmas** para todas. Para as ordens que ainda vão iniciar ou finalizar, o `GET` da seção 3 deve devolver a fase com `situacao: "REGISTRADA"` e `compartilhada: true`. Assim o modal não pede a foto de novo e a transição segue sem `evidencia_id`.

Fica com back e banco:
- identificar o deslocamento compartilhado de forma estável;
- não duplicar arquivo nem km.

## 6. Exceção sem foto

O motorista designado usa **Solicitar autorização sem foto** na saída ou chegada. O gestor competente abre **Pedidos sem foto** na aba da operação em **Viagens**. Motivo do pedido e justificativa de decisão devem ter de 10 a 500 caracteres úteis. Uma recusa fica no histórico. O motorista pode enviar outro pedido.

| Método e rota | Contrato |
|---|---|
| `POST /api/evidencias-odometro/excecoes` | `tipo_operacao`, `viagem_id`, `fase` e `motivo`. Reenvio enquanto houver pedido aberto retorna o mesmo pedido. |
| `GET /api/evidencias-odometro/excecoes` | `tipo_operacao` e `pagina`. Retorna `dados` e `tem_mais` para gestores da operação. |
| `PATCH /api/evidencias-odometro/excecoes/:id` | `tipo_operacao`, `decisao` (`APROVADA` ou `RECUSADA`) e `justificativa`. Um pedido já decidido ou invalidado responde 409. |
| `GET /api/evidencias-odometro` | Inclui `pedidos_excecao` por fase e `pode_solicitar_excecao`, além das evidências existentes e da configuração efetiva. |

A aprovação ainda permite enviar foto. Sem foto, a transição consome a autorização no mesmo commit, usando o km informado, e grava a evidência `EXCECAO_GESTOR` com referência à auditoria da decisão. Cancelamento e realocação invalidam os pedidos correspondentes. No SVO, a aprovação abre somente a fase da ordem designada. Após a comprovação, a evidência física pode ser compartilhada pelas demais ordens do deslocamento. A quilometragem segue obrigatória.

## 7. Banco (SCRUM-210) e armazenamento (SCRUM-211)

O front não depende da modelagem interna, só do contrato acima. Pontos que o contrato exige:
- Unicidade por (`tipo_operacao`, `viagem_id`, `fase`) para a evidência confirmada, e por `chave_idempotencia` para o envio.
- Ligação com o deslocamento compartilhado SVO (seção 5).
- Retenção: 12 meses **a partir da conclusão real** da viagem ou do deslocamento. Ao expirar, só o arquivo sai; o registro continua com `EXPIRADA`.
- Armazenamento privado e persistente: nada no disco efêmero do Render, sem bucket público.

## 8. Checklist para ligar o interruptor

1. Validar as migrations SCRUM-210, SCRUM-211 e SCRUM-203 e as permissões de banco em homologação.
2. Configurar o PostgreSQL privado e as flags do backend conforme o [guia operacional](operacao-odometro-e-agenda-svo.md).
3. Gerar o frontend com `VITE_FOTOS_ODOMETRO_ATIVAS=true`.
4. Testar no celular (Android/Chrome e iOS/Safari):
   - câmera, galeria e prévia;
   - erro de rede;
   - nova tentativa sem duplicar a foto;
   - viagem administrativa e coleta SVO;
   - acesso negado entre as frotas.
