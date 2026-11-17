# Segurança da integração contínua

Este documento registra os controles do PR associado à SCRUM-162 e uma proposta de processo para análise de exceções. Uma configuração em branch de PR não significa que o controle já esteja ativo no repositório.

## Dependências e Dependabot

O workflow `ci-cd.yml` executa `npm audit --audit-level=high` nos jobs `Verificar Frontend` e `Verificar Backend`. O comando consulta o registro npm e retorna falha para vulnerabilidades de severidade alta ou crítica; uma falha de consulta ao registro também deve ser investigada. O relatório pode conter achados de outras severidades. Não se deve usar `npm audit fix --force` automaticamente.

O arquivo `.github/dependabot.yml` propõe atualizações semanais para os pacotes npm dos dois projetos e para GitHub Actions. O `target-branch: develop` faz com que as atualizações **de versão** usem os manifests dessa branch e abram PRs para ela. Para o Dependabot ler essa configuração, o arquivo precisa estar na branch padrão, atualmente `main`.

As atualizações **de segurança** são independentes da programação semanal e têm como origem alertas do Dependabot sobre dependências da branch padrão; quando habilitadas e aplicáveis, seus PRs têm como destino a branch padrão. Não se deve presumir que a configuração de versão direcionada à `develop` também direcione para ela os PRs de segurança. Confirme o grafo de dependências, alertas e atualizações de segurança nas configurações do repositório e acompanhe eventuais correções também na `develop` pelo fluxo de integração aprovado.

Referências: [opções de target-branch](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#target-branch) e [PRs do Dependabot](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-pull-requests).

## Proteção da branch de integração

As auditorias só impedem a integração se os jobs forem checks obrigatórios da branch e não houver bypass aplicável. O workflow, sozinho, não configura essa proteção. Em 17/11/2026, a API indicou `develop` sem proteção e o ruleset consultado exigia `Verificar Frontend` e `Verificar Backend` somente para `main`.

Um administrador deve configurar uma regra ativa para `develop` que exija PR e os dois checks exatos, vinculados ao GitHub Actions quando disponível, revisar os atores com bypass e conferir as regras efetivas da organização. Depois, deve verificar em um PR de teste autorizado que um check pendente ou reprovado impede o merge e que ambos aprovados permitem a integração sujeita às demais regras. Não contornar ou enfraquecer uma regra existente para testar. Registre o link da regra e da execução verificada na SCRUM-162.

## Segredos e CodeQL

O repositório é público e o GitHub oferece Secret Scanning e CodeQL para repositórios públicos elegíveis. Isso não comprova a configuração efetiva, a visibilidade dos alertas ou o funcionamento de notificações neste repositório. Um administrador deve verificar o estado de Secret Scanning, alertas para usuários e push protection, conferir permissões de leitura dos alertas e registrar evidência sem expor conteúdo de segredos. Caso o controle não esteja ativo ou não atenda ao escopo, definir e validar uma solução antes de encerrar a tarefa. Não incluir credenciais reais no histórico para testar.

CodeQL é tecnicamente aplicável ao JavaScript/TypeScript do frontend e backend. A configuração padrão do GitHub é uma opção de baixa manutenção; ela analisa PRs para a branch padrão ou branches protegidas, com limitações documentadas para forks. Primeiro confirme se já existe configuração ativa equivalente e verifique cobertura e execuções. Se não existir, avalie habilitar a configuração padrão ou um workflow avançado conforme as permissões e necessidades do projeto. Não configurar os dois sem verificar conflitos; não considerar a análise ativa até existir uma execução bem-sucedida e verificável.

Referências: [Secret Scanning](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enable-secret-scanning), [consultas CodeQL para JavaScript/TypeScript](https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-queries/javascript-typescript-built-in-queries) e [configuração padrão do CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types).

## Tratamento proposto de exceções

O padrão é corrigir ou atualizar a dependência e repetir a auditoria. Se isso não for possível, registrar uma exceção antes de solicitar sua aceitação, incluindo:

1. Identificador do alerta ou advisory, pacote, versão, caminho de dependência, branch e link da execução.
2. Avaliação de exposição e impacto no projeto, justificativa técnica, alternativas consideradas e controles compensatórios.
3. Pessoa responsável pela correção, aprovador autorizado, data de aprovação, prazo de validade e data da próxima revisão.
4. Plano de correção e condição de encerramento, com links para o item de acompanhamento e as evidências dos retestes.

O responsável deve revisar a exceção na data prevista, quando houver nova correção disponível e quando o contexto ou a severidade mudarem. Renovações exigem nova justificativa e aprovação. Uma exceção vencida não deve ser tratada como autorização permanente. O registro não altera automaticamente o resultado de `npm audit` nem autoriza bypass dos checks; qualquer mecanismo técnico de exceção precisa de revisão própria, escopo limitado e rastreabilidade. Nunca inclua credenciais ou dados sensíveis no registro.

## Critério para encerrar SCRUM-162

Além do resultado dos testes e builds, registrar evidências dos checks obrigatórios em `develop` e `main`, da configuração e execução do Dependabot após chegar à branch padrão, da detecção e tratamento de segredos, da avaliação de CodeQL e do processo de exceções. Até essas verificações, tratar o PR como entrega parcial e manter a tarefa aberta.
