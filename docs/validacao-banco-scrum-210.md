# Relatorio de Validacao de Banco — SCRUM-210 (Metadados Imutaveis das Evidencias de Odometro)

Responsavel (Frente de Banco): Gabriel Arruda (`@GArrudaC`)
Referencias: `SCRUM-203` (HU pai), `SCRUM-208`, `SCRUM-209` e `SCRUM-210`

Nota de privacidade e seguranca: este documento utiliza apenas agregados anonimizados e exemplos sinteticos, sem expor identificadores operacionais reais, hostnames ou credenciais de ambientes compartilhados.

---

## 1. Contexto e Decisoes Arquiteturais da Modelagem (`SCRUM-210`)

A `SCRUM-210` exige persistir os metadados imutaveis das evidencias de odometro (`SAIDA` e `CHEGADA`) tanto para viagens administrativas (`viagens_frota`) quanto para coletas SVO (`ordens_svo`), atendendo simultaneamente:

1. **Separacao estrita de IDs entre `viagens_frota` e `ordens_svo` com integridade referencial forte (`FOREIGN KEY ... ON DELETE RESTRICT`)**:
   - Como `viagens_frota.id` e `ordens_svo.id` utilizam sequencias proprias e podem possuir o mesmo valor numerico (por exemplo, `id = 1` em ambas), nao foi utilizada coluna polimorfica sem FK.
   - Em `evidencias_odometro`, a constraint `chk_evidencias_odometro_origem_operacao` exige:
     - Quando `tipo_operacao = 'ADMINISTRATIVA'`: `viagem_frota_id IS NOT NULL` (FK para `viagens_frota`) e `deslocamento_svo_id IS NULL AND ordem_svo_id IS NULL`.
     - Quando `tipo_operacao = 'SVO'`: `deslocamento_svo_id IS NOT NULL` (FK para `deslocamentos_svo`) e `viagem_frota_id IS NULL`.
2. **Deslocamento fisico compartilhado no SVO (`deslocamentos_svo` e `deslocamentos_svo_ordens`)**:
   - Um mesmo deslocamento fisico de um veiculo SVO pode atender multiplas ordens (`ordens_svo`) sem duplicar o par de fotos (`SAIDA` e `CHEGADA`) nem inventar quilometragens independentes.
   - A tabela `deslocamentos_svo` representa o deslocamento fisico real (`veiculo_id`, `motorista_id`, `km_inicial`, `km_final`, `data_hora_saida`, `data_hora_conclusao`, `status`), com indices unicos parciais `uq_deslocamentos_svo_veiculo_em_curso` e `uq_deslocamentos_svo_motorista_em_curso` (`WHERE status = 'EM_CURSO'`).
   - A tabela `deslocamentos_svo_ordens` vincula cada `ordem_svo_id` a exatamente um deslocamento fisico (`uq_deslocamentos_svo_ordens_ordem`), protegendo contra a associacao acidental de uma ordem a dois deslocamentos diferentes.
3. **Metadados de foto privada (sem Base64 no banco) e Excecao Autorizada pelo Gestor**:
   - `modalidade = 'FOTO'`: exige `storage_key` (bloqueando path traversal `..`, `data:` base64 e URLs `http:`/`https:` via `chk_evidencias_odometro_storage_key_segura`), `mime_type` (`image/jpeg`, `image/png`, `image/webp`), `tamanho_bytes` (`1..15728640`) e `sha256` (`^[0-9a-f]{64}$`).
   - `modalidade = 'EXCECAO_GESTOR'`: exige `excecao_aprovada_por IS NOT NULL`, `excecao_aprovada_em IS NOT NULL`, `length(btrim(excecao_justificativa)) >= 10` e **`excecao_aprovada_por <> motorista_usuario_id`**, impedindo diretamente no PostgreSQL que o proprio motorista aprove sua excecao.
4. **Retencao de 12 meses contados da conclusao efetiva e Preservacao Legal (`Legal Hold`)**:
   - A constraint `chk_evidencias_odometro_retencao` garante que:
     - `retencao_ate` so existe quando `conclusao_operacao_em IS NOT NULL` e deve ser `>= conclusao_operacao_em + interval '12 months'`.
     - O expurgo do arquivo (`status = 'EXPURGADA_RETENCAO'`, limpando `storage_key = NULL`) e bloqueado enquanto `preservacao_legal = true`, enquanto a operacao nao tiver conclusao real ou antes de `retencao_ate`.
     - Ao expurgar a imagem apos 12 meses, o registro em `evidencias_odometro` (`sha256`, `km_registrado`, `auditoria_id`, `expurgado_em`, `expurgo_motivo`), a viagem administrativa, as ordens SVO e a auditoria permanecem 100% preservados.

---

## 2. Minimo Privilegio e Imutabilidade na Role `frotas_app`

Em `src/backend/scripts/provisionar-usuario-app.cjs` e na migration `20261118121000_scrum_210_evidencias_odometro_e_deslocamentos_svo.js`:
- A role `frotas_app` recebe apenas `SELECT, INSERT, UPDATE` sobre `deslocamentos_svo`, `deslocamentos_svo_ordens` e `evidencias_odometro` (e `USAGE, SELECT` nas respectivas sequences), com `REVOKE DELETE` explicito.
- `inspecionarEstadoRole` e `validarEstadoMinimoPrivilegio` verificam automaticamente `podeDeletarEvidenciasOdometro = false`.

---

## 3. Evidencias Reproduziveis de Validacao em PostgreSQL Isolado

Comando reproduzivel:
```bash
cd src/backend
npm run db:validar-scrum210
```

Resultado obtido:
- `1. Bloqueio de estrutura preexistente incompativel no up: OK`
- `2. Aplicacao limpa da migration SCRUM-210 (up) e validacao de catalogo: OK`
- `3. Distincao entre viagens_frota(id=1) e deslocamentos_svo(id=1) e compartilhamento entre ordens SVO: OK`
- `4. Constraints de unicidade por (operacao, fase), anti-traversal/base64 e excecao aprovada por gestor distinto: OK`
- `5. Retencao de 12 meses apos conclusao real, bloqueio por preservacao legal e expurgo mantendo metadados: OK`
- `6. Plano de execucao EXPLAIN (uq_evidencias_odometro_viagem_frota_fase_ativa): OK`
- `7. Protecao contra rollback destrutivo (evidencias_odometro, deslocamentos_svo_ordens e deslocamentos_svo): OK`
- `8. Ciclo completo de rollback limpo (down estrito) e reaplicacao (up) preservando viagens e ordens: OK`
- `9. Validacao de minimo privilegio da role da aplicacao (rolsuper=false, rolinherit=false, podeDeletarEvidenciasOdometro=false): OK`
