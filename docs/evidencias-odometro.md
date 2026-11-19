# Fotos do odômetro: back (SCRUM-208 e SCRUM-209)

Back das fotos do odômetro na saída e na chegada (HU SCRUM-203). Usa as tabelas da SCRUM-210 (`evidencias_odometro`, `deslocamentos_svo`, `deslocamentos_svo_ordens`) e segue o contrato do front em `docs/scrum-203-contrato-backend.md` (PR #171). As diferenças estão na seção "Diferenças em relação ao contrato".

Tudo começa **desligado**:
- sem armazenamento, as rotas de foto respondem 503;
- com as fotos opcionais, iniciar e finalizar funcionam como antes, sem foto.

## Configuração

| Variável | Valores | Padrão | Para que serve |
|---|---|---|---|
| `EVIDENCIAS_STORAGE` | `desativado`, `local`, `r2` | `desativado` | Onde ficam os arquivos. `local` é uma pasta do servidor e `r2` usa um bucket privado. |
| `EVIDENCIAS_STORAGE_DIR` | caminho | `src/backend/storage/evidencias` | Pasta do `local`. Em produção é obrigatória, absoluta e num **disco persistente**. |
| `FOTOS_ODOMETRO_OBRIGATORIAS` | `true`, `false` | `false` | `true`: iniciar e finalizar exigem a foto. Só é aceito com armazenamento configurado. |

O driver `r2` usa a interface `ArmazenamentoEvidencias` e gera chaves opacas. O banco guarda a referência do objeto e os metadados da evidência, e a API entrega a imagem pelo proxy autenticado. [Configuração e homologação da SCRUM-211](scrum-211-armazenamento-odometro.md)

## Rotas

### `POST /api/evidencias-odometro`: enviar a foto

Recebe `multipart/form-data` com os campos:
- `tipo_operacao`;
- `viagem_id`;
- `fase` (`SAIDA` | `CHEGADA`);
- `chave_idempotencia` (UUID);
- `arquivo`.

Validação:
- O servidor confere a assinatura e decodifica imagens JPEG, PNG e WebP com até 16 milhões de pixels. A imagem guardada tem a orientação aplicada e os metadados EXIF removidos. Arquivo corrompido ou com resolução excessiva recebe 422.
- O arquivo tem no máximo 10 MB e fica só na memória, nunca no disco temporário.
- O envio tem tempo limite próprio de 60 s; o geral da API é de 15 s.

Regras:
- Envia quem pode iniciar ou finalizar a viagem: o motorista da própria viagem ou o gestor da operação.
- A saída só aceita foto com a viagem agendada. A chegada, com a viagem em andamento. Uma fase já registrada responde 409.
- A foto nasce **provisória** (`STAGING`) e vale por 30 minutos.
- O banco registra a reserva antes de enviar os bytes. O reenvio com a mesma chave e conteúdo reaproveita a reserva. Se os bytes ainda precisarem ser enviados, a escrita condicional impede sobrescrita.
- Gera auditoria `ENVIOU_FOTO_ODOMETRO`.

Resposta `201`: `{ "id": "15", "fase": "SAIDA", "expira_em": "..." }`.

### `PATCH /api/viagens/:id/iniciar` e `/finalizar`: transição com a foto

Os corpos aceitam `evidencia_id`, como número ou como texto. A foto é confirmada **na mesma transação** da transição. Se algo falhar, nem a viagem nem a foto mudam.

| Código | Status | Quando |
|---|---|---|
| `EVIDENCIA_OBRIGATORIA` | 400 | Com `FOTOS_ODOMETRO_OBRIGATORIAS=true`, sem foto e sem a fase coberta. |
| `EVIDENCIA_INVALIDA` | 400 | A foto é de outra viagem, fase ou usuário, já foi usada ou não existe. |
| `EVIDENCIA_EXPIRADA` | 400 | A foto provisória passou de 30 minutos. |

Para outros erros (por exemplo, km menor que o atual), o front reaproveita a mesma foto. A auditoria da transição ganha ` evidencia=<id>`.

**Retenção.** Ao finalizar, `conclusao_operacao_em` e `retencao_ate` (12 meses depois) são gravados nas fotos. A contagem parte da conclusão real da viagem. No SVO, parte da conclusão do deslocamento. A rotina da SCRUM-211 usa esses campos e a preservação legal. O expurgo é habilitado operacionalmente após a homologação.

### Coletas SVO e deslocamento compartilhado

**Ao iniciar uma ordem SVO**, o back faz uma de duas coisas:
- se o veículo já está num deslocamento em curso com o mesmo motorista, liga a ordem a esse deslocamento;
- se não, abre um deslocamento novo.

As ordens do mesmo deslocamento usam **as mesmas fotos**: quem inicia ou finaliza depois não precisa enviar outra.

**Ao finalizar**, o deslocamento só é concluído quando a última ordem ligada a ele termina. Ordens iniciadas antes desta funcionalidade ganham um deslocamento na finalização.

### `GET /api/evidencias-odometro?tipo_operacao=&viagem_id=`: situação das fases

Responde com o formato do contrato: `saida` e `chegada`, cada uma com:
- `situacao`: `PENDENTE`, `REGISTRADA`, `EXCECAO_AUTORIZADA`, `EXPIRADA` ou `SEM_REGISTRO`;
- `compartilhada`;
- `excecao`;
- `pode_baixar`.

Quem pode consultar:
- **Gestores**, pela operação: Administrador nas duas, Gestor de Frota só a administrativa, Gestor SVO só o SVO. A consulta gera a auditoria `CONSULTOU_FOTOS_ODOMETRO`.
- **Motoristas**, só a própria viagem, sem `pode_baixar` e sem auditoria. O modal de iniciar e finalizar usa essa consulta para saber se a foto já foi registrada.
- Demais perfis: 403.

### `GET /api/evidencias-odometro/:id/arquivo[?download=1]`: a imagem

Disponível só para gestores, com a mesma regra por operação. A imagem chega por proxy autenticado:
- `Cache-Control: no-store`;
- `Content-Type` do formato real;
- `Content-Disposition: attachment` quando há `download=1`.

Só uma foto confirmada (`ATIVA`) tem arquivo. Provisória, exceção ou expurgada respondem 404. O download gera a auditoria `BAIXOU_FOTO_ODOMETRO`.

## Diferenças em relação ao contrato do front

- **`id` numérico** (a SCRUM-210 usa `INTEGER`), devolvido como texto. Não é "opaco", mas toda leitura confere a permissão pela operação, e a foto provisória só é aceita do próprio usuário. O front já trata o id como texto.
- **Motorista consulta a situação da própria viagem.** O contrato dizia 403, mas o modal precisa saber se a foto já foi registrada (deslocamento compartilhado). O motorista continua sem acesso ao arquivo.
- **Sem coluna de chave de idempotência.** A chave entra na `storage_key`, que tem índice único.

## Foto provisória SVO no banco (resolvido no #170)

A foto de saída SVO é enviada **antes** de a coleta iniciar, quando o deslocamento ainda não existe. Por isso a regra `chk_evidencias_odometro_origem_operacao` da SCRUM-210 aceita a foto **provisória** SVO (`STAGING` ou `REJEITADA`) ligada só à ordem (`ordem_svo_id`). A confirmação na transição preenche o `deslocamento_svo_id`. Foto ativa, exceção e foto expurgada continuam exigindo o deslocamento.

O ajuste entrou na própria migration da SCRUM-210 (commit `8b0b7da` do #170), então não há passo manual.

## Fora deste PR

- **Agendamento da limpeza e do expurgo** no ambiente hospedado. A SCRUM-211 fornece o comando para simulação e execução controlada.
- **Tela de aprovação da exceção sem foto.** Ficou para o desenho técnico, por decisão da SCRUM-203. O back já reconhece a exceção registrada (`EXCECAO_GESTOR`, `ATIVA`) como fase coberta.

## Testes

- `evidenciaOdometroRoutes.test.ts`: permissões, multipart, 413, 503, campos inválidos e `evidencia_id` na transição.
- `evidenciaOdometroArmazenamento.test.ts`: pasta local, chaves perigosas, assinatura do arquivo e variáveis de ambiente.
- `evidenciaOdometroPostgres.test.ts`: fluxo completo em PostgreSQL descartável, com as fotos opcionais e obrigatórias, foto inválida e expirada, idempotência, permissões por operação, deslocamento SVO compartilhado e retenção de 12 meses.

  Só roda com `SCRUM208_POSTGRES_TESTS=1`, `POSTGRES_HOST=127.0.0.1` e `POSTGRES_DB=frotas_teste`, depois de `npm run migrate`.
