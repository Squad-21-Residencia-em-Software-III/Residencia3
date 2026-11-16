// Relatórios gerenciais exportáveis (BL35 / RF18 / RN20)
export const TIPOS_RELATORIO = ['viagens', 'abastecimentos', 'manutencoes', 'multas'] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];

// O PDF é entregue em subtarefa própria e acrescenta 'pdf' a esta lista
export const FORMATOS_EXPORTACAO = ['csv', 'xlsx'] as const;
export type FormatoExportacao = (typeof FORMATOS_EXPORTACAO)[number];

// Teto de linhas por exportação, para não carregar o resultado inteiro em memória
export const LIMITE_LINHAS_EXPORTACAO = 50000;

// Mesmo fuso usado nas regras de disponibilidade e no dashboard
export const FUSO_RELATORIOS = 'America/Sao_Paulo';
