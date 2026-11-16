export type TipoColuna = 'texto' | 'inteiro' | 'decimal' | 'data' | 'data_hora';

export interface ColunaTabela {
  chave: string;
  titulo: string;
  tipo: TipoColuna;
}

// Dados tabulares independentes do formato de saída (CSV, XLSX e, futuramente, PDF)
export interface TabelaExportavel {
  titulo: string;
  colunas: ColunaTabela[];
  linhas: Record<string, unknown>[];
}
