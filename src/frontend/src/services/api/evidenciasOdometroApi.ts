import type {
  EvidenciaEnviada,
  EvidenciasDaViagem,
  FaseOdometro,
  DecisaoExcecaoOdometro,
  PedidoExcecaoOdometro,
} from '../../types/evidenciaOdometro';
import type { Viagem } from '../../types/viagem';
import { downloadBlob, request } from './http';

type ReferenciaViagem = Pick<Viagem, 'id' | 'tipo_operacao'>;

/**
 * Fotos do odômetro (SCRUM-203). Só é usado com o interruptor `fotosOdometro` ligado.
 * Contrato: docs/scrum-203-contrato-backend.md.
 */
export const evidenciasOdometroApi = {
  configuracao: () => request<{ fotos_disponiveis: boolean; excecoes_disponiveis: boolean }>(
    'GET', '/evidencias-odometro/configuracao',
  ),

  solicitarExcecao: ({ id, tipo_operacao }: ReferenciaViagem, fase: FaseOdometro, motivo: string) =>
    request<PedidoExcecaoOdometro>('POST', '/evidencias-odometro/excecoes', {
      body: { tipo_operacao, viagem_id: id, fase, motivo },
    }),

  listarExcecoes: (tipo_operacao: ReferenciaViagem['tipo_operacao'], pagina: number) =>
    request<{ dados: Array<PedidoExcecaoOdometro & { motorista_nome: string }>; tem_mais: boolean }>(
      'GET', '/evidencias-odometro/excecoes', { query: { tipo_operacao, pagina } },
    ),

  decidirExcecao: (pedido: PedidoExcecaoOdometro, decisao: DecisaoExcecaoOdometro, justificativa: string) =>
    request<PedidoExcecaoOdometro>('PATCH', `/evidencias-odometro/excecoes/${pedido.id}`, {
      body: { tipo_operacao: pedido.tipo_operacao, decisao, justificativa },
    }),

  /**
   * Envia a foto antes da transição. Ela fica provisória até `iniciar`/`finalizar` usar o id
   * devolvido. A mesma `chave_idempotencia` em um reenvio devolve a mesma evidência.
   */
  enviar: (
    { id, tipo_operacao }: ReferenciaViagem,
    fase: FaseOdometro,
    arquivo: File,
    { chaveIdempotencia, signal }: { chaveIdempotencia: string; signal?: AbortSignal },
  ) => {
    const formData = new FormData();
    formData.append('tipo_operacao', tipo_operacao);
    formData.append('viagem_id', String(id));
    formData.append('fase', fase);
    formData.append('chave_idempotencia', chaveIdempotencia);
    formData.append('arquivo', arquivo);
    return request<EvidenciaEnviada>('POST', '/evidencias-odometro', { formData, signal });
  },

  /** Situação das duas fases da viagem ou coleta, com os dados de quem registrou. */
  consultar: ({ id, tipo_operacao }: ReferenciaViagem) =>
    request<EvidenciasDaViagem>('GET', '/evidencias-odometro', {
      query: { tipo_operacao, viagem_id: id },
    }),

  /** Arquivo da foto por proxy autenticado; nunca por link público. */
  arquivo: (evidenciaId: string, baixar = false) =>
    downloadBlob(`/evidencias-odometro/${encodeURIComponent(evidenciaId)}/arquivo`, {
      download: baixar ? 1 : undefined,
    }),
};
