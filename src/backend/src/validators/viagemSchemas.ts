import { z } from 'zod';

const idSchema = (campo: string) =>
  z
    .number({ error: `O campo ${campo} é obrigatório` })
    .int(`O campo ${campo} deve ser um número inteiro`)
    .positive(`O campo ${campo} deve ser positivo`);

const kmSchema = (campo: string) =>
  z
    .number({ error: `O campo ${campo} é obrigatório` })
    .int('A quilometragem deve ser um número inteiro')
    .nonnegative('A quilometragem não pode ser negativa');

export const tipoOperacaoSchema = z.enum(['ADMINISTRATIVA', 'SVO'], {
  error: 'Tipo de operação inválido. Valores aceitos: ADMINISTRATIVA, SVO',
});

export type TipoOperacao = z.infer<typeof tipoOperacaoSchema>;

const recursosViagem = {
  solicitacao_id: idSchema('solicitacao_id'),
  veiculo_id: idSchema('veiculo_id'),
  motorista_id: idSchema('motorista_id'),
};

export const criarViagemSchema = z.discriminatedUnion(
  'tipo_operacao',
  [
    z.object({
      tipo_operacao: z.literal('ADMINISTRATIVA'),
      ...recursosViagem,
    }),
    z.object({
      tipo_operacao: z.literal('SVO'),
      ...recursosViagem,
      equipe_id: idSchema('equipe_id').nullish(),
      capacidade_utilizada: z
        .number({ error: 'A capacidade utilizada deve ser um número' })
        .int('A capacidade utilizada deve ser um número inteiro')
        .min(1, 'A capacidade utilizada deve ser de no mínimo 1')
        .default(1),
    }),
  ],
  { error: 'Tipo de operação inválido. Valores aceitos: ADMINISTRATIVA, SVO' }
);

// Nas ações sobre uma viagem existente, o tipo indica a tabela (viagens_frota ou ordens_svo)
const tipoDaViagem = {
  tipo_operacao: tipoOperacaoSchema.default('ADMINISTRATIVA'),
};

export const iniciarViagemSchema = z.object({
  ...tipoDaViagem,
  km_inicial: kmSchema('km_inicial'),
});

export const finalizarViagemSchema = z.object({
  ...tipoDaViagem,
  km_final: kmSchema('km_final'),
});

export const cancelarViagemSchema = z.object({
  ...tipoDaViagem,
  // true: também cancela a solicitação; false: a solicitação pode ser atendida de novo
  cancelar_solicitacao: z.boolean({ error: 'O campo cancelar_solicitacao deve ser verdadeiro ou falso' }).default(false),
});

export type CriarViagemInput = z.infer<typeof criarViagemSchema>;
