export type TipoColuna = 'texto' | 'inteiro' | 'decimal' | 'data' | 'data_hora';

export interface ColunaTabela {
  chave: string;
  titulo: string;
  tipo: TipoColuna;
  casasDecimaisCsv?: 2 | 6;
}

// Dados tabulares independentes do formato de saída (CSV, XLSX e PDF)
export interface TabelaExportavel {
  titulo: string;
  colunas: ColunaTabela[];
  linhas: Record<string, unknown>[];
  // Chaves das colunas que cabem na página do PDF; sem ela o PDF usa todas as colunas.
  // CSV e XLSX sempre levam todas as colunas.
  colunasPdf?: string[];
  // Observações impressas no cabeçalho do PDF (por exemplo, o escopo do relatório)
  notas?: string[];
}

// Dados da geração que não fazem parte da tabela (usados no cabeçalho do PDF)
export interface ContextoExportacao {
  periodo?: { inicio?: string; fim?: string };
  geradoEm?: Date;
}
