import { z } from 'zod';
import {
  CATEGORIAS_CNH_APROVADAS,
  dataCivilValida,
  normalizarCnh,
  validarEstruturaCnh,
  VALIDADE_CNH_MAXIMA,
  VALIDADE_CNH_MINIMA,
} from '../constants/cnh';

export const listarMotoristasSchema = z.object({
  status: z
    .enum(['DISPONIVEL', 'DESIGNADO', 'EM_VIAGEM', 'AFASTADO', 'INATIVO'], {
      error: 'Status inválido. Valores aceitos: DISPONIVEL, DESIGNADO, EM_VIAGEM, AFASTADO, INATIVO',
    })
    .optional(),
  tipo_motorista: z
    .enum(['FROTA', 'SVO'], { error: 'Tipo de motorista inválido. Valores aceitos: FROTA, SVO' })
    .optional(),
});

export type ListarMotoristasFiltros = z.infer<typeof listarMotoristasSchema>;

// Número como texto: um número JSON perderia os zeros à esquerda.
const numeroCnh = z
  .string({ error: 'Informe o número da CNH como texto' })
  .transform(normalizarCnh)
  .superRefine((valor, ctx) => {
    const problema = validarEstruturaCnh(valor);
    if (problema === 'FORMATO') {
      ctx.addIssue({ code: 'custom', message: 'A CNH deve conter 11 dígitos (pontos, hífens e espaços são ignorados)' });
    } else if (problema === 'MANIFESTAMENTE_INVALIDO') {
      ctx.addIssue({ code: 'custom', message: 'Número de CNH inválido' });
    }
  });

const categoriaCnh = z
  .string({ error: 'Informe a categoria da CNH' })
  .transform((valor) => valor.trim().toUpperCase())
  .pipe(
    z.enum(CATEGORIAS_CNH_APROVADAS, {
      error: `Categoria inválida. Valores aceitos: ${CATEGORIAS_CNH_APROVADAS.join(', ')}`,
    })
  );

const validadeCnh = z
  .string({ error: 'Informe a validade da CNH no formato AAAA-MM-DD' })
  .refine(dataCivilValida, { error: 'Data de validade inválida (use AAAA-MM-DD com uma data existente)' })
  .refine((valor) => valor >= VALIDADE_CNH_MINIMA && valor <= VALIDADE_CNH_MAXIMA, {
    error: `A validade deve estar entre ${VALIDADE_CNH_MINIMA} e ${VALIDADE_CNH_MAXIMA}`,
  });

// .strict(): perfil, tipo, status, unidade ou id enviados no corpo são rejeitados, não ignorados.
export const criarMotoristaSchema = z
  .object({
    usuario_id: z.number({ error: 'Informe o usuário' }).int({ error: 'Usuário inválido' }).positive({ error: 'Usuário inválido' }),
    numero_cnh: numeroCnh,
    categoria_cnh: categoriaCnh,
    validade_cnh: validadeCnh,
  })
  .strict();

export const atualizarMotoristaSchema = z
  .object({
    numero_cnh: numeroCnh.optional(),
    categoria_cnh: categoriaCnh.optional(),
    validade_cnh: validadeCnh.optional(),
  })
  .strict()
  .refine((dados) => Object.keys(dados).length > 0, { error: 'Informe ao menos um campo para atualizar' });

export type CriarMotoristaInput = z.infer<typeof criarMotoristaSchema>;
export type AtualizarMotoristaInput = z.infer<typeof atualizarMotoristaSchema>;
