# Segurança da integração contínua

Este documento registra os controles do PR associado à SCRUM-162 e o processo aprovado para análise de exceções. Uma configuração em branch de PR não significa que o controle já esteja ativo no repositório.

## Dependências e Dependabot

O workflow `ci-cd.yml` executa `npm audit --audit-level=high` nos jobs `Verificar Frontend` e `Verificar Backend`. O comando consulta o registro npm e retorna falha para vulnerabilidades de severidade alta ou crítica; uma falha de consulta ao registro também deve ser investigada. O relatório pode conter achados de outras severidades. Não se deve usar `npm audit fix --force` automaticamente.

O arquivo `.github/dependabot.yml` propõe atualizações semanais para os pacotes npm dos dois projetos e para GitHub Actions. O `target-branch: develop` faz com que as atualizações **de versão** usem os manifests dessa branch e abram PRs para ela. Para o Dependabot ler essa configuração, o arquivo precisa estar na branch padrão, atualmente `main`.

As atualizações **de segurança** são independentes da programação semanal e têm como origem alertas do Dependabot sobre dependências da branch padrão; quando habilitadas e aplicáveis, seus PRs têm como destino a branch padrão. Não se deve presumir que a configuração de versão direcionada à `develop` também direcione para ela os PRs de segurança. Em 17/11/2026 foram habilitados o grafo de dependências, os alertas do Dependabot e as atualizações de segurança. A configuração de versões ainda depende da chegada do arquivo à `main` e da validação de sua execução. Acompanhe as correções também na `develop` pelo fluxo de integração aprovado.

Referências: [opções de target-branch](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#target-branch) e [PRs do Dependabot](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-pull-requests).

## Proteção da branch de integração

As auditorias só impedem a integração se os jobs forem checks obrigatórios da branch e não houver bypass aplicável. O workflow, sozinho, não configura essa proteção. Em 17/11/2026 foi criado o [ruleset para develop](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/rules/27436152), ativo, exigindo PR e os checks `Verificar Frontend` e `Verificar Backend` do GitHub Actions, sem atores de bypass configurados. A regra também bloqueia exclusão e push forçado.

Ainda é necessário comprovar em um PR de teste que um check pendente ou reprovado impede o merge e que ambos aprovados permitem a integração sujeita às demais regras. Não contornar ou enfraquecer uma regra existente para testar. Registre a evidência na SCRUM-162.

## Segredos e CodeQL

O repositório é público e o GitHub oferece Secret Scanning e CodeQL para repositórios públicos elegíveis. Em 17/11/2026, o [painel de segurança](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/security) mostrava Secret scanning alerts como habilitado, e a [lista de alertas](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/security/secret-scanning) mostrava zero abertos e zero encerrados. Isso comprova o estado exibido, mas não uma detecção ponta a ponta nem entrega de notificações. Um administrador deve conferir push protection e permissões de leitura, e definir uma forma segura de validar o fluxo de alerta sem expor conteúdo de segredos. Não incluir credenciais reais no histórico para testar.

CodeQL é tecnicamente aplicável ao JavaScript/TypeScript do frontend e backend. Matheus Andrade autorizou a configuração padrão do GitHub, que foi ativada em 17/11/2026. A [análise inicial](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/actions/runs/44028178738) terminou com sucesso para JavaScript/TypeScript e GitHub Actions. A configuração analisa PRs para a branch padrão ou branches protegidas, com limitações documentadas para forks. Evite configurações conflitantes e confira as análises nos próximos PRs.

Referências: [Secret Scanning](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enable-secret-scanning), [consultas CodeQL para JavaScript/TypeScript](https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-queries/javascript-typescript-built-in-queries) e [configuração padrão do CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types).

## Tratamento de exceções

Matheus Andrade aprovou o processo abaixo em 17/11/2026. A aprovação do processo não aprova exceções individuais nem autoriza bypass de checks.

O padrão é corrigir ou atualizar a dependência e repetir a auditoria. Se isso não for possível, registrar uma exceção antes de solicitar sua aceitação, incluindo:

1. Identificador do alerta ou advisory, pacote, versão, caminho de dependência, branch e link da execução.
2. Avaliação de exposição e impacto no projeto, justificativa técnica, alternativas consideradas e controles compensatórios.
3. Pessoa responsável pela correção, aprovador autorizado, data de aprovação, prazo de validade e data da próxima revisão.
4. Plano de correção e condição de encerramento, com links para o item de acompanhamento e as evidências dos retestes.

O responsável deve revisar a exceção na data prevista, quando houver nova correção disponível e quando o contexto ou a severidade mudarem. Renovações exigem nova justificativa e aprovação. Uma exceção vencida não deve ser tratada como autorização permanente. O registro não altera automaticamente o resultado de `npm audit` nem autoriza bypass dos checks; qualquer mecanismo técnico de exceção precisa de revisão própria, escopo limitado e rastreabilidade. Nunca inclua credenciais ou dados sensíveis no registro.

## Critério para encerrar SCRUM-162

Além do resultado dos testes e builds, registrar evidências dos checks obrigatórios em `develop` e `main`, da configuração e execução do Dependabot após chegar à branch padrão, da detecção e tratamento de segredos, da avaliação de CodeQL e do processo de exceções. Até essas verificações, tratar o PR como entrega parcial e manter a tarefa aberta.
