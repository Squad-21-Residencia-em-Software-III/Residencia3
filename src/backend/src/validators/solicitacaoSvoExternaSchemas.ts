import { z } from 'zod';

/**
 * Contrato de entrada do formulário público do SVO (SCRUM-264).
 * Espelha os limites da migration da SCRUM-263 (solicitacoes_svo + solicitacoes_svo_dados_externos).
 * Canal, registrante, protocolo, status e demais campos operacionais são definidos só no servidor:
 * qualquer campo fora desta lista é rejeitado (strictObject).
 * As mensagens de erro nunca repetem o valor enviado, para não vazar dado pessoal em respostas e logs.
 */

export const TIPOS_SOLICITANTE_EXTERNO = ['PESSOA_FISICA', 'INSTITUICAO'] as const;

export const LIMITES_SOLICITACAO_EXTERNA = {
  nomeSolicitante: { min: 2, max: 150 },
  nomeInstituicao: { min: 2, max: 180 },
  telefone: { min: 8, max: 30 },
  email: { min: 5, max: 255 },
  nomeFalecido: { min: 2, max: 150 },
  documentoFalecido: { max: 60 },
  endereco: { min: 3, max: 255 },
  numeroImovel: { max: 30 },
  complemento: { max: 120 },
  pontoReferencia: { max: 255 },
  descricao: { min: 5, max: 2000 },
  informacoesMedicas: { max: 2000 },
  versaoAviso: { max: 40 },
} as const;

// Tolerância para relógios de aparelhos levemente adiantados
export const TOLERANCIA_DATA_FUTURA_MS = 5 * 60 * 1000;

// Caracteres de controle, exceto tabulação, quebra de linha e retorno de carro
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function normalizar(valor: string, multilinha: boolean): string {
  const nfc = valor.normalize('NFC');
  if (!multilinha) return nfc.replace(/\s+/g, ' ').trim();
  return nfc
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function texto(rotulo: string, limites: { min?: number; max: number }, multilinha = false) {
  const min = limites.min ?? 1;
  return z
    .string({ error: `${rotulo} é obrigatório` })
    .transform((valor) => normalizar(valor, multilinha))
    .pipe(
      z
        .string()
        .min(min, min === 1 ? `${rotulo} é obrigatório` : `${rotulo} deve ter no mínimo ${min} caracteres`)
        .max(limites.max, `${rotulo} deve ter no máximo ${limites.max} caracteres`)
        .refine((valor) => !CONTROLES.test(valor), `${rotulo} contém caracteres inválidos`),
    );
}

// Campo opcional: ausente, nulo ou vazio viram "não informado"
function textoOpcional(rotulo: string, max: number, multilinha = false) {
  return z.preprocess(
    (valor) => (valor === null || (typeof valor === 'string' && valor.trim() === '') ? undefined : valor),
    texto(rotulo, { max }, multilinha).optional(),
  );
}

/** Valida formato e dígitos verificadores. Não afirma nem confirma a identidade de ninguém. */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digitos = [...cpf].map(Number);
  const verificador = (quantidade: number): number => {
    let soma = 0;
    for (let i = 0; i < quantidade; i += 1) soma += (digitos[i] ?? 0) * (quantidade + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return verificador(9) === digitos[9] && verificador(10) === digitos[10];
}

const cpfSchema = z
  .string({ error: 'O CPF é obrigatório' })
  .transform((valor) => valor.replace(/[.\-\s]/g, ''))
  .pipe(z.string().refine(cpfValido, 'CPF inválido'));

const telefoneSchema = texto('O telefone', LIMITES_SOLICITACAO_EXTERNA.telefone).pipe(
  z
    .string()
    .regex(/^[0-9+() -]+$/, 'O telefone contém caracteres inválidos')
    .refine((valor) => (valor.match(/\d/g) ?? []).length >= 8, 'O telefone deve ter ao menos 8 dígitos'),
);

const emailSchema = z
  .string({ error: 'O e-mail é obrigatório' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(LIMITES_SOLICITACAO_EXTERNA.email.min, 'E-mail inválido')
      .max(LIMITES_SOLICITACAO_EXTERNA.email.max, 'E-mail inválido')
      .refine((valor) => !CONTROLES.test(valor), 'E-mail inválido')
      .pipe(z.email('E-mail inválido')),
  );

const latitudeSchema = z
  .number({ error: 'A latitude deve ser um número' })
  .min(-90, 'Latitude fora do intervalo permitido')
  .max(90, 'Latitude fora do intervalo permitido');

const longitudeSchema = z
  .number({ error: 'A longitude deve ser um número' })
  .min(-180, 'Longitude fora do intervalo permitido')
  .max(180, 'Longitude fora do intervalo permitido');

// Normalizada para ISO em UTC, que serve de base estável para o digest do payload (idempotência)
function dataHoraOcorrenciaSchema(agora: () => Date) {
  return z
    .string({ error: 'A data e hora da ocorrência são obrigatórias' })
    .trim()
    .pipe(z.iso.datetime({ offset: true, error: 'Data e hora da ocorrência inválidas' }))
    .transform((valor) => new Date(valor).toISOString())
    .refine(
      (valor) => new Date(valor).getTime() <= agora().getTime() + TOLERANCIA_DATA_FUTURA_MS,
      'A data e hora da ocorrência não podem estar no futuro',
    );
}

export function criarSolicitacaoSvoExternaSchema(agora: () => Date = () => new Date()) {
  const L = LIMITES_SOLICITACAO_EXTERNA;
  return z
    .strictObject(
      {
        tipo_solicitante: z.enum(TIPOS_SOLICITANTE_EXTERNO, { error: 'Tipo de solicitante inválido' }),
        nome_instituicao: textoOpcional('O nome da instituição', L.nomeInstituicao.max),
        nome_solicitante: texto('O nome do solicitante', L.nomeSolicitante),
        telefone_solicitante: telefoneSchema,
        email_solicitante: emailSchema,
        cpf_solicitante: cpfSchema,

        nome_falecido: texto('O nome do falecido', L.nomeFalecido),
        documento_falecido: textoOpcional('O documento do falecido', L.documentoFalecido.max),

        // Gravado em solicitacoes_svo.local_ocorrencia (endereço manual aceito)
        local_ocorrencia: texto('O endereço da ocorrência', L.endereco),
        numero_imovel: textoOpcional('O número do imóvel', L.numeroImovel.max),
        sem_numero_imovel: z.boolean({ error: 'Informe se o imóvel é sem número' }).default(false),
        complemento_ocorrencia: textoOpcional('O complemento', L.complemento.max),
        ponto_referencia: textoOpcional('O ponto de referência', L.pontoReferencia.max),
        latitude_ocorrencia: latitudeSchema.nullish().transform((valor) => valor ?? undefined),
        longitude_ocorrencia: longitudeSchema.nullish().transform((valor) => valor ?? undefined),
        fora_area_cobertura: z.boolean({ error: 'Valor inválido para fora da área de cobertura' }).default(false),

        descricao_ocorrencia: texto('A descrição da ocorrência', L.descricao, true),
        data_hora_ocorrencia: dataHoraOcorrenciaSchema(agora),
        informacoes_medicas: textoOpcional('As informações médicas', L.informacoesMedicas.max, true),

        ciencia_aviso_privacidade: z.literal(true, { error: 'É necessário estar ciente do aviso de privacidade' }),
        versao_aviso_privacidade: texto('A versão do aviso de privacidade', { max: L.versaoAviso.max }),
      },
      { error: 'Campo não permitido na solicitação externa' },
    )
    .superRefine((dados, ctx) => {
      if (dados.tipo_solicitante === 'INSTITUICAO' && !dados.nome_instituicao) {
        ctx.addIssue({ code: 'custom', path: ['nome_instituicao'], message: 'O nome da instituição é obrigatório' });
      }
      if (dados.tipo_solicitante === 'PESSOA_FISICA' && dados.nome_instituicao) {
        ctx.addIssue({
          code: 'custom',
          path: ['nome_instituicao'],
          message: 'O nome da instituição só se aplica a solicitante institucional',
        });
      }
      if (dados.sem_numero_imovel && dados.numero_imovel) {
        ctx.addIssue({
          code: 'custom',
          path: ['numero_imovel'],
          message: 'Imóvel sem número não deve ter número informado',
        });
      }
      if (!dados.sem_numero_imovel && !dados.numero_imovel) {
        ctx.addIssue({
          code: 'custom',
          path: ['numero_imovel'],
          message: 'Informe o número do imóvel ou marque sem número',
        });
      }
      if ((dados.latitude_ocorrencia === undefined) !== (dados.longitude_ocorrencia === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: ['latitude_ocorrencia'],
          message: 'Informe latitude e longitude juntas ou nenhuma delas',
        });
      }
    });
}

export const solicitacaoSvoExternaSchema = criarSolicitacaoSvoExternaSchema();

export type CriarSolicitacaoSvoExternaInput = z.infer<typeof solicitacaoSvoExternaSchema>;

// Cabeçalhos da tentativa de criação (mesmo formato do contrato da SCRUM-266).
// A chave identifica a tentativa; a prova é gerada pelo navegador e nunca depende da chave.
export const CABECALHO_CHAVE_IDEMPOTENCIA = 'idempotency-key';
export const CABECALHO_PROVA_TENTATIVA = 'x-prova-tentativa';

export const cabecalhosCriacaoExternaSchema = z.object({
  [CABECALHO_CHAVE_IDEMPOTENCIA]: z
    .string({ error: 'O cabeçalho Idempotency-Key é obrigatório' })
    .trim()
    .regex(/^[A-Za-z0-9._:-]{8,120}$/, 'Idempotency-Key inválido'),
  [CABECALHO_PROVA_TENTATIVA]: z
    .string({ error: 'O cabeçalho X-Prova-Tentativa é obrigatório' })
    .trim()
    .regex(/^[A-Za-z0-9_-]{32,128}$/, 'X-Prova-Tentativa inválido'),
});
