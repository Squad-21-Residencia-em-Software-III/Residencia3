# Exceção temporária na auditoria npm

O CI registra o relatório completo de `npm audit --audit-level=high --json` e aceita temporariamente apenas o advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) de `picomatch` e os alertas propagados exclusivamente por ele. Outros alertas altos ou críticos e falhas na auditoria continuam bloqueando o CI. Essa aceitação não corrige a vulnerabilidade: ela permanece nas ferramentas de desenvolvimento e build. Evite fornecer padrões glob não confiáveis a essas ferramentas.

Quando houver uma versão corrigida publicada, atualize as dependências e os lockfiles, execute as auditorias completas, testes e builds, e remova `scripts/audit-ci.cjs`, seus testes e esta documentação. Restaure `npm audit --audit-level=high` nos dois jobs do workflow. Até então, revise periodicamente o advisory e a exceção.
