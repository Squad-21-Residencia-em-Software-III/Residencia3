import { downloadBlob } from './http';

export const TIPOS_RELATORIO = ['viagens', 'abastecimentos', 'manutencoes', 'multas'] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];

export const FORMATOS_EXPORTACAO = ['xlsx', 'csv', 'pdf'] as const;
export type FormatoExportacao = (typeof FORMATOS_EXPORTACAO)[number];

export interface PeriodoExportacao {
  inicio?: string;
  fim?: string;
}

export function salvarBlobNoNavegador(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const relatoriosApi = {
  async exportar(
    tipo: TipoRelatorio,
    formato: FormatoExportacao,
    periodo?: PeriodoExportacao,
  ): Promise<string> {
    const { blob, filename } = await downloadBlob(`/relatorios/${tipo}/exportar`, {
      formato,
      inicio: periodo?.inicio,
      fim: periodo?.fim,
    });
    const nomeFinal = filename ?? `relatorio-${tipo}.${formato}`;
    salvarBlobNoNavegador(blob, nomeFinal);
    return nomeFinal;
  },
};
