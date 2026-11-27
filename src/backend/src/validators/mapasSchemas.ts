import { z } from 'zod';
import { AppError } from '../errors/AppError';

const operacao = z.enum(['ADM', 'SVO']).default('ADM');

export const coordenadasSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type CoordenadasMapa = z.infer<typeof coordenadasSchema>;
const arredondar = (valor: number) => Number(valor.toFixed(6));
const decimal = /^-?\d{1,3}(?:\.\d{1,12})?$/;

const coordenada = (minimo: number, maximo: number) => z.string().regex(decimal)
  .transform(Number).pipe(z.number().min(minimo).max(maximo)).transform(arredondar);
const latitude = coordenada(-90, 90);
const longitude = coordenada(-180, 180);

const textoEndereco = z.string().max(240).transform((texto) => texto.normalize('NFKC').trim().replace(/ +/g, ' '))
  .pipe(z.string().min(3).max(120)
    .regex(/^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'ºª()/-]*$/u)
    .refine((texto) => !/\b(?:cpf|rg|telefone|contato|paciente|diagnóstico|ocorrência|prontuário|senha|token)\b/iu.test(texto))
    .refine((texto) => !/\d(?:[ .()/-]*\d){8}/.test(texto) && !/^(?:\d[ -]*)+$/.test(texto))
  );

export const unidadeMapaSchema = z.enum(['HEMOSE', 'LACEN', 'SVO']);
export type UnidadeMapa = z.infer<typeof unidadeMapaSchema>;

export const buscarMapaSchema = z.strictObject({
  operacao,
  q: textoEndereco.optional(),
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/).transform((cep) => cep.replace('-', '')).optional(),
  unidade: z.string().trim().toUpperCase().pipe(unidadeMapaSchema).optional(),
}).refine((query) => [query.q, query.cep, query.unidade].filter(Boolean).length === 1);

export const reversoMapaSchema = z.strictObject({ operacao, lat: latitude, lon: longitude });
export const MAXIMO_PONTOS_ROTA = 50;
export const MAXIMO_PARADAS_ADM = 8;
export const rotaMapaSchema = z.strictObject({
  operacao,
  pontos: z.array(z.string().max(36)).min(2).max(MAXIMO_PONTOS_ROTA),
  retornarOrigem: z.enum(['true', 'false']).default('false').transform((valor) => valor === 'true'),
}).superRefine(({ operacao, pontos, retornarOrigem }, ctx) => {
  if (operacao === 'ADM' && pontos.length > MAXIMO_PARADAS_ADM + 2) {
    ctx.addIssue({ code: 'custom', path: ['pontos'], message: 'O roteiro administrativo admite até oito paradas.' });
  }
  if (pontos.length + Number(retornarOrigem) > MAXIMO_PONTOS_ROTA) {
    ctx.addIssue({ code: 'custom', path: ['pontos'], message: 'O limite técnico inclui o retorno à origem.' });
  }
}).transform(({ pontos, ...query }, ctx) => {
  const coordenadas = pontos.map((ponto, indice) => {
    if (ponto === '') return null;
    const partes = ponto.split(',');
    const resultado = z.tuple([latitude, longitude]).safeParse(partes);
    if (resultado.success) return { latitude: resultado.data[0], longitude: resultado.data[1] };
    ctx.addIssue({ code: 'custom', path: ['pontos', indice], message: 'Coordenadas inválidas.' });
    return null;
  });
  return { ...query, pontos: coordenadas };
});

export function validarConsultaMapa<T>(schema: z.ZodType<T>, entrada: unknown): T {
  const resultado = schema.safeParse(entrada);
  if (!resultado.success) {
    throw new AppError('Parâmetros de mapa inválidos. Confira o contrato da operação.', 400, 'MAPAS_PARAMETROS_INVALIDOS');
  }
  return resultado.data;
}
