import { FORMATOS_EXPORTACAO, LIMITE_LINHAS_EXPORTACAO, LIMITE_LINHAS_PDF } from '../constants/relatorios';
import type { FormatoExportacao, TipoRelatorio } from '../constants/relatorios';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { gerarCsv } from '../exportadores/csvExportador';
import { hojeNoFusoLocal } from '../exportadores/formatacao';
import { gerarPdf } from '../exportadores/pdfExportador';
import type { ColunaTabela, ContextoExportacao, TabelaExportavel } from '../exportadores/tipos';
import { gerarXlsx } from '../exportadores/xlsxExportador';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { relatorioModel, type LinhaRelatorio } from '../models/relatorioModel';
import type { PeriodoRelatorio } from '../validators/relatorioSchemas';
import { TIPOS_POR_PERFIL } from './viagemService';

interface Autor {
  id: number;
  perfil: Perfil;
}

interface DefinicaoRelatorio {
  titulo: string;
  descricao: string;
  colunas: ColunaTabela[];
  // Colunas que cabem na página do PDF (CSV e XLSX sempre levam todas)
  colunasPdf?: string[];
  // Observação impressa no cabeçalho do PDF, conforme o perfil de quem exporta
  nota?: (autor: Autor) => string | undefined;
  buscar: (periodo: PeriodoRelatorio, autor: Autor, limite: number) => Promise<LinhaRelatorio[]>;
}

export interface RelatorioDisponivel {
  tipo: TipoRelatorio;
  titulo: string;
  descricao: string;
  formatos: readonly FormatoExportacao[];
}

export interface ArquivoExportado {
  nomeArquivo: string;
  contentType: string;
  conteudo: Buffer;
}

// RF18/RN20: relatórios gerenciais são do Gestor de Frota e do Administrador
const PERFIS_COM_ACESSO: Perfil[] = [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA];

// Frotas que o perfil enxerga (mesmo vocabulário de tipo_frota); perfil sem escopo não recebe nada
const frotasDoPerfil = (autor: Autor) => TIPOS_POR_PERFIL[autor.perfil] ?? [];

// Escopo impresso no PDF dos relatórios filtrados por tipo de frota
const notaDeFrota = (autor: Autor) =>
  frotasDoPerfil(autor).includes('SVO') ? 'Escopo: frota administrativa e SVO' : 'Escopo: frota administrativa';

const DEFINICOES: Record<TipoRelatorio, DefinicaoRelatorio> = {
  viagens: {
    titulo: 'Viagens',
    descricao:
      'Viagens administrativas e ordens de coleta SVO no período. O Gestor de Frota recebe apenas as administrativas.',
    colunas: [
      { chave: 'id', titulo: 'ID', tipo: 'inteiro' },
      { chave: 'tipo_operacao', titulo: 'Tipo', tipo: 'texto' },
      { chave: 'status', titulo: 'Status', tipo: 'texto' },
      { chave: 'origem', titulo: 'Origem', tipo: 'texto' },
      { chave: 'destino', titulo: 'Destino', tipo: 'texto' },
      { chave: 'finalidade', titulo: 'Finalidade', tipo: 'texto' },
      { chave: 'solicitante_nome', titulo: 'Solicitante', tipo: 'texto' },
      { chave: 'veiculo_placa', titulo: 'Placa', tipo: 'texto' },
      { chave: 'veiculo_modelo', titulo: 'Veículo', tipo: 'texto' },
      { chave: 'motorista_nome', titulo: 'Motorista', tipo: 'texto' },
      { chave: 'inicio_previsto', titulo: 'Início previsto', tipo: 'data_hora' },
      { chave: 'fim_previsto', titulo: 'Fim previsto', tipo: 'data_hora' },
      { chave: 'data_hora_efetiva_saida', titulo: 'Saída efetiva', tipo: 'data_hora' },
      { chave: 'data_hora_efetiva_chegada', titulo: 'Chegada efetiva', tipo: 'data_hora' },
      { chave: 'km_inicial', titulo: 'Km inicial', tipo: 'inteiro' },
      { chave: 'km_final', titulo: 'Km final', tipo: 'inteiro' },
    ],
    colunasPdf: [
      'id',
      'tipo_operacao',
      'status',
      'origem',
      'destino',
      'veiculo_placa',
      'motorista_nome',
      'inicio_previsto',
      'data_hora_efetiva_saida',
      'data_hora_efetiva_chegada',
      'km_inicial',
      'km_final',
    ],
    nota: (autor) =>
      TIPOS_POR_PERFIL[autor.perfil]?.includes('SVO')
        ? 'Escopo: viagens administrativas e ordens de coleta SVO'
        : 'Escopo: viagens administrativas',
    // Mesmo escopo por perfil das demais operações de viagem
    buscar: (periodo, autor, limite) => relatorioModel.viagens(frotasDoPerfil(autor), periodo, limite),
  },

  abastecimentos: {
    titulo: 'Abastecimentos',
    descricao:
      'Abastecimentos no período, com litros, valor total e preço por litro. O Gestor de Frota recebe apenas os da frota administrativa.',
    colunas: [
      { chave: 'id', titulo: 'ID', tipo: 'inteiro' },
      { chave: 'data_abastecimento', titulo: 'Data', tipo: 'data' },
      { chave: 'veiculo_placa', titulo: 'Placa', tipo: 'texto' },
      { chave: 'veiculo_modelo', titulo: 'Veículo', tipo: 'texto' },
      { chave: 'motorista_nome', titulo: 'Motorista', tipo: 'texto' },
      { chave: 'fornecedor_nome', titulo: 'Fornecedor', tipo: 'texto' },
      { chave: 'posto_combustivel', titulo: 'Posto', tipo: 'texto' },
      { chave: 'quilometragem', titulo: 'Quilometragem', tipo: 'inteiro' },
      { chave: 'litros', titulo: 'Litros', tipo: 'decimal' },
      { chave: 'valor_total', titulo: 'Valor total (R$)', tipo: 'decimal' },
      { chave: 'preco_por_litro', titulo: 'Preço por litro (R$)', tipo: 'decimal' },
    ],
    nota: notaDeFrota,
    buscar: (periodo, autor, limite) => relatorioModel.abastecimentos(periodo, limite, frotasDoPerfil(autor)),
  },

  manutencoes: {
    titulo: 'Manutenções',
    descricao:
      'Manutenções preventivas e corretivas no período, com fornecedor e custo. O Gestor de Frota recebe apenas as da frota administrativa.',
    colunas: [
      { chave: 'id', titulo: 'ID', tipo: 'inteiro' },
      { chave: 'data_manutencao', titulo: 'Data', tipo: 'data' },
      { chave: 'veiculo_placa', titulo: 'Placa', tipo: 'texto' },
      { chave: 'veiculo_modelo', titulo: 'Veículo', tipo: 'texto' },
      { chave: 'tipo_manutencao', titulo: 'Tipo', tipo: 'texto' },
      { chave: 'fornecedor_nome', titulo: 'Fornecedor', tipo: 'texto' },
      { chave: 'descricao', titulo: 'Descrição', tipo: 'texto' },
      { chave: 'custo', titulo: 'Custo (R$)', tipo: 'decimal' },
      { chave: 'status', titulo: 'Status', tipo: 'texto' },
    ],
    nota: notaDeFrota,
    buscar: (periodo, autor, limite) => relatorioModel.manutencoes(periodo, limite, frotasDoPerfil(autor)),
  },

  multas: {
    titulo: 'Multas',
    descricao:
      'Multas de trânsito com data da infração no período, valor, pontos e situação do pagamento. O Gestor de Frota recebe apenas as da frota administrativa.',
    colunas: [
      { chave: 'id', titulo: 'ID', tipo: 'inteiro' },
      { chave: 'data_infracao', titulo: 'Data da infração', tipo: 'data_hora' },
      { chave: 'veiculo_placa', titulo: 'Placa', tipo: 'texto' },
      { chave: 'veiculo_modelo', titulo: 'Veículo', tipo: 'texto' },
      { chave: 'motorista_nome', titulo: 'Motorista', tipo: 'texto' },
      { chave: 'id_infracao', titulo: 'Código da infração', tipo: 'texto' },
      { chave: 'orgao_autuador', titulo: 'Órgão autuador', tipo: 'texto' },
      { chave: 'descricao', titulo: 'Descrição', tipo: 'texto' },
      { chave: 'pontos', titulo: 'Pontos', tipo: 'inteiro' },
      { chave: 'valor', titulo: 'Valor (R$)', tipo: 'decimal' },
      { chave: 'data_vencimento', titulo: 'Vencimento', tipo: 'data' },
      { chave: 'status_pagamento', titulo: 'Pagamento', tipo: 'texto' },
    ],
    nota: notaDeFrota,
    buscar: (periodo, autor, limite) => relatorioModel.multas(periodo, limite, frotasDoPerfil(autor)),
  },
};

interface SaidaDoFormato {
  extensao: string;
  contentType: string;
  // Teto de linhas do formato e orientação dada quando ele é ultrapassado
  limiteLinhas: number;
  sugestaoAoExceder?: string;
  gerar: (tabela: TabelaExportavel, contexto: ContextoExportacao) => Buffer;
}

const FORMATOS: Record<FormatoExportacao, SaidaDoFormato> = {
  csv: {
    extensao: 'csv',
    contentType: 'text/csv; charset=utf-8',
    limiteLinhas: LIMITE_LINHAS_EXPORTACAO,
    gerar: (tabela) => gerarCsv(tabela),
  },
  xlsx: {
    extensao: 'xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    limiteLinhas: LIMITE_LINHAS_EXPORTACAO,
    gerar: (tabela) => gerarXlsx(tabela),
  },
  pdf: {
    extensao: 'pdf',
    contentType: 'application/pdf',
    limiteLinhas: LIMITE_LINHAS_PDF,
    sugestaoAoExceder: ' ou exporte em CSV ou XLSX',
    gerar: gerarPdf,
  },
};

function garantirAcesso(autor: Autor): void {
  if (!PERFIS_COM_ACESSO.includes(autor.perfil)) {
    throw new AppError('Você não tem permissão para acessar os relatórios', 403);
  }
}

export const relatorioService = {
  listarDisponiveis(autor: Autor): RelatorioDisponivel[] {
    garantirAcesso(autor);

    return (Object.keys(DEFINICOES) as TipoRelatorio[]).map((tipo) => ({
      tipo,
      titulo: DEFINICOES[tipo].titulo,
      descricao: DEFINICOES[tipo].descricao,
      formatos: FORMATOS_EXPORTACAO,
    }));
  },

  // Dados independentes de formato: o PDF reutiliza esta mesma tabela
  async gerar(
    tipo: TipoRelatorio,
    periodo: PeriodoRelatorio,
    autor: Autor,
    { limite = LIMITE_LINHAS_EXPORTACAO, sugestao = '' }: { limite?: number; sugestao?: string } = {},
  ): Promise<TabelaExportavel> {
    garantirAcesso(autor);

    const definicao = DEFINICOES[tipo];
    // Uma linha além do limite basta para saber que o resultado foi truncado
    const linhas = await definicao.buscar(periodo, autor, limite + 1);

    if (linhas.length > limite) {
      throw new AppError(`O relatório excede ${limite} linhas. Reduza o período e tente novamente${sugestao}`, 422);
    }

    const nota = definicao.nota?.(autor);

    return {
      titulo: definicao.titulo,
      colunas: definicao.colunas,
      linhas,
      ...(definicao.colunasPdf ? { colunasPdf: definicao.colunasPdf } : {}),
      ...(nota ? { notas: [nota] } : {}),
    };
  },

  async exportar(
    tipo: TipoRelatorio,
    formato: FormatoExportacao,
    periodo: PeriodoRelatorio,
    autor: Autor,
  ): Promise<ArquivoExportado> {
    const saida = FORMATOS[formato];
    const tabela = await relatorioService.gerar(tipo, periodo, autor, {
      limite: saida.limiteLinhas,
      sugestao: saida.sugestaoAoExceder,
    });
    const conteudo = saida.gerar(tabela, { periodo, geradoEm: new Date() });

    await auditoriaModel.registrar({
      usuario_id: autor.id,
      acao:
        `EXPORTOU_RELATORIO tipo=${tipo} formato=${formato} linhas=${tabela.linhas.length}` +
        ` inicio=${periodo.inicio ?? '-'} fim=${periodo.fim ?? '-'}`,
      modulo: MODULOS_AUDITORIA.RELATORIOS,
    });

    return {
      nomeArquivo: `relatorio-${tipo}-${hojeNoFusoLocal()}.${saida.extensao}`,
      contentType: saida.contentType,
      conteudo,
    };
  },
};

