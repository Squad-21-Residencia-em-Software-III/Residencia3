// Relatórios gerenciais exportáveis (BL35 / RF18 / RN20)
export const TIPOS_RELATORIO = ['viagens', 'abastecimentos', 'manutencoes', 'multas'] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];

export const FORMATOS_EXPORTACAO = ['csv', 'xlsx', 'pdf'] as const;
export type FormatoExportacao = (typeof FORMATOS_EXPORTACAO)[number];

// Teto de linhas por exportação, para não carregar o resultado inteiro em memória
export const LIMITE_LINHAS_EXPORTACAO = 50000;

// O PDF tem teto próprio: é gerado de forma síncrona, e 50.000 linhas viram milhares de páginas
// (cerca de 3,7 s de processamento e 180 MB de memória). Com 5.000 linhas são cerca de 260 páginas.
export const LIMITE_LINHAS_PDF = 5000;

// Mesmo fuso usado nas regras de disponibilidade e no dashboard
export const FUSO_RELATORIOS = 'America/Sao_Paulo';
