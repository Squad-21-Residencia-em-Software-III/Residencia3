import { valorComoTexto } from './formatacao';
import type { TabelaExportavel } from './tipos';

// Excel em pt-BR espera ';' como separador e UTF-8 com BOM para acentuação correta
const SEPARADOR = ';';
const QUEBRA_DE_LINHA = '\r\n';
const BOM = '\uFEFF';

// Texto iniciado por estes caracteres seria interpretado como fórmula ao abrir no Excel (CSV injection)
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

// Caracteres de controle (exceto tab, CR e LF) não têm representação útil em planilhas
// eslint-disable-next-line no-control-regex
const CONTROLE_INVALIDO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function escaparCelula(texto: string): string {
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function gerarCsv(tabela: TabelaExportavel): Buffer {
  const linhas: string[] = [tabela.colunas.map((coluna) => escaparCelula(coluna.titulo)).join(SEPARADOR)];

  for (const linha of tabela.linhas) {
    const celulas = tabela.colunas.map((coluna) => {
      const texto = valorComoTexto(linha[coluna.chave], coluna.tipo).replace(CONTROLE_INVALIDO, '');
      // Só colunas de texto livre recebem a neutralização: números negativos continuam numéricos
      const seguro = coluna.tipo === 'texto' && INICIO_DE_FORMULA.test(texto) ? `'${texto}` : texto;
      return escaparCelula(seguro);
    });
    linhas.push(celulas.join(SEPARADOR));
  }

  return Buffer.from(BOM + linhas.join(QUEBRA_DE_LINHA) + QUEBRA_DE_LINHA, 'utf8');
}
