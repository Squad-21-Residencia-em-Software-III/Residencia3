import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { coordenadasSchema, MAXIMO_PARADAS_ADM } from '../validators/mapasSchemas';
import type { criarMapasService, RotaMapa } from './mapasService';

const local = z.strictObject({
  endereco: z.string().trim().min(1).max(255),
  coordenadas: coordenadasSchema.nullish(),
});

const roteiro = z.strictObject({
  origem: local,
  destino: local,
  paradas: z.array(local.extend({ id: z.number().int().positive().optional() })).max(MAXIMO_PARADAS_ADM),
  retornarOrigem: z.boolean(),
  inicioPrevisto: z.iso.datetime({ offset: true }),
  fimPrevisto: z.iso.datetime({ offset: true }),
});

export const roteiroAdministrativoSchema = roteiro.superRefine((roteiro, ctx) => {
  if (Date.parse(roteiro.fimPrevisto) <= Date.parse(roteiro.inicioPrevisto)) {
    ctx.addIssue({ code: 'custom', path: ['fimPrevisto'], message: 'O término deve ser posterior ao início.' });
  }
  const ids = roteiro.paradas.flatMap(({ id }) => id === undefined ? [] : [id]);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['paradas'], message: 'Uma parada existente só pode aparecer uma vez.' });
  }
});

export type RoteiroAdministrativo = z.infer<typeof roteiroAdministrativoSchema>;
type CalcularMapa = ReturnType<typeof criarMapasService>['rota'];

export async function calcularRoteiroAdministrativo(
  roteiro: RoteiroAdministrativo, calcular: CalcularMapa, contexto: Parameters<CalcularMapa>[1],
): Promise<RotaMapa | { metodo: 'INDISPONIVEL'; motivo: 'SEM_COORDENADAS' | 'SEM_ROTA' }> {
  const pontos = [roteiro.origem, ...roteiro.paradas, roteiro.destino].map((local) => local.coordenadas ?? null);
  if (pontos.some((ponto) => ponto === null)) {
    return { metodo: 'INDISPONIVEL', motivo: 'SEM_COORDENADAS' };
  }
  try {
    return await calcular({ pontos, operacao: 'ADM', retornarOrigem: roteiro.retornarOrigem }, contexto);
  } catch (erro) {
    if (erro instanceof AppError && erro.codigo === 'ROTA_INDISPONIVEL') {
      return { metodo: 'INDISPONIVEL', motivo: 'SEM_ROTA' };
    }
    throw erro;
  }
}

const revisaoRoteiroSchema = z.strictObject({
  versaoRoteiro: z.number().int().nonnegative(),
  justificativa: z.string().trim().min(1).max(500),
  roteiro: roteiroAdministrativoSchema,
});

type ParadaVigente = RoteiroAdministrativo['paradas'][number] & {
  id: number;
  estado: 'PENDENTE' | 'REALIZADA' | 'NAO_REALIZADA';
};

export function validarRevisaoRoteiroAdministrativo(entrada: unknown, vigente: {
  versao: number;
  paradas: readonly ParadaVigente[];
}) {
  const revisao = revisaoRoteiroSchema.parse(entrada);
  if (revisao.versaoRoteiro !== vigente.versao) {
    throw new AppError('A versão do roteiro foi alterada.', 409, 'ROTEIRO_DESATUALIZADO');
  }
  const ids = new Set(vigente.paradas.map(({ id }) => id));
  if (revisao.roteiro.paradas.some(({ id }) => id !== undefined && !ids.has(id))) {
    throw new AppError('Parada não pertence ao roteiro vigente.', 422, 'ROTEIRO_PARADA_INDEVIDA');
  }
  for (const [i, parada] of vigente.paradas.entries()) {
    if (parada.estado === 'PENDENTE') continue;
    const proposta = revisao.roteiro.paradas[i];
    if (proposta?.id !== parada.id || proposta.endereco !== parada.endereco ||
        proposta.coordenadas?.latitude !== parada.coordenadas?.latitude ||
        proposta.coordenadas?.longitude !== parada.coordenadas?.longitude) {
      throw new AppError('Parada decidida deve permanecer na posição e local registrados.', 409, 'ROTEIRO_PARADA_DECIDIDA');
    }
  }
  return revisao;
}
