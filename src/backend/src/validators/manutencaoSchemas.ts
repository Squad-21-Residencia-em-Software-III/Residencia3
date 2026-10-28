import { z } from 'zod';

export const TIPOS_MANUTENCAO = ['PREVENTIVA', 'CORRETIVA'] as const;
export const STATUS_MANUTENCAO = ['AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA'] as const;

function dataDeHoje(): string {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-${dia}`;
}

export const criarManutencaoSchema = z
  .object({
    veiculo_id: z
      .number({ error: 'O veículo é obrigatório' })
      .int('ID do veículo inválido')
      .positive('ID do veículo inválido'),
    fornecedor_id: z
      .number({ error: 'ID do fornecedor inválido' })
      .int('ID do fornecedor inválido')
      .positive('ID do fornecedor inválido')
      .optional(),
    tipo_manutencao: z
      .string({ error: 'O tipo de manutenção é obrigatório' })
      .trim()
      .toUpperCase()
      .pipe(
        z.enum(TIPOS_MANUTENCAO, {
          error: 'Tipo de manutenção inválido. Valores aceitos: PREVENTIVA, CORRETIVA',
        })
      ),
    data_manutencao: z.iso.date({ error: 'Data da manutenção inválida (formato AAAA-MM-DD)' }),
    descricao: z
      .string({ error: 'A descrição é obrigatória' })
      .trim()
      .min(3, 'A descrição deve ter no mínimo 3 caracteres'),
    custo: z
      .number({ error: 'O custo é obrigatório' })
      .finite('Custo inválido')
      .nonnegative('O custo não pode ser negativo'),
    status: z
      .enum(STATUS_MANUTENCAO, {
        error: 'Status inválido. Valores aceitos: AGENDADA, EM_ANDAMENTO, CONCLUIDA',
      })
      .optional(),
  })
  .strict()
  .refine((dados) => dados.status !== 'CONCLUIDA' || dados.data_manutencao <= dataDeHoje(), {
    message: 'Uma manutenção concluída não pode ter data futura',
    path: ['data_manutencao'],
  });

export type CriarManutencaoInput = z.infer<typeof criarManutencaoSchema>;
