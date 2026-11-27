import { describe, expect, it } from 'vitest';
import {
  cpfValido,
  criarSolicitacaoSvoExternaSchema,
  type CriarSolicitacaoSvoExternaInput,
} from '../validators/solicitacaoSvoExternaSchemas';

// Todos os dados abaixo são sintéticos
const AGORA = new Date('2026-11-27T15:00:00.000Z');
const schema = criarSolicitacaoSvoExternaSchema(() => AGORA);

const base = {
  tipo_solicitante: 'PESSOA_FISICA',
  nome_solicitante: 'Maria Teste da Silva',
  telefone_solicitante: '(79) 99999-0000',
  email_solicitante: 'maria.teste@example.com',
  cpf_solicitante: '529.982.247-25',
  nome_falecido: 'Joao Teste Falecido',
  local_ocorrencia: 'Rua Fictícia dos Testes',
  numero_imovel: '123',
  descricao_ocorrencia: 'Descrição sintética da ocorrência para teste.',
  data_hora_ocorrencia: '2026-11-27T10:30:00-03:00',
  ciencia_aviso_privacidade: true,
  versao_aviso_privacidade: '2026-11-v1',
};

const validar = (extra: Record<string, unknown> = {}) => schema.safeParse({ ...base, ...extra });

function mensagens(resultado: ReturnType<typeof validar>): string {
  return resultado.success ? '' : JSON.stringify(resultado.error.issues);
}

describe('solicitacaoSvoExternaSchema (SCRUM-264)', () => {
  it('aceita payload mínimo válido e aplica padrões', () => {
    const resultado = validar();
    expect(resultado.success).toBe(true);
    const dados = resultado.data as CriarSolicitacaoSvoExternaInput;
    expect(dados.sem_numero_imovel).toBe(false);
    expect(dados.fora_area_cobertura).toBe(false);
    expect(dados.cpf_solicitante).toBe('52998224725');
    expect(dados.data_hora_ocorrencia).toBe('2026-11-27T13:30:00.000Z');
  });

  it('normaliza espaços, e-mail e campos opcionais vazios', () => {
    const resultado = validar({
      nome_solicitante: '  Maria   Teste  ',
      email_solicitante: '  MARIA@Example.COM ',
      complemento_ocorrencia: '   ',
      ponto_referencia: '',
      documento_falecido: null,
    });
    expect(resultado.success).toBe(true);
    const dados = resultado.data as CriarSolicitacaoSvoExternaInput;
    expect(dados.nome_solicitante).toBe('Maria Teste');
    expect(dados.email_solicitante).toBe('maria@example.com');
    expect(dados.complemento_ocorrencia).toBeUndefined();
    expect(dados.ponto_referencia).toBeUndefined();
    expect(dados.documento_falecido).toBeUndefined();
  });

  describe('campos controlados pelo servidor', () => {
    it.each([
      'status', 'canal_origem', 'registrante_id', 'protocolo', 'destino',
      'gestor_id', 'prioridade', 'material_sensivel', 'confirmado_por',
    ])('rejeita o campo %s', (campo) => {
      const resultado = validar({ [campo]: 'x' });
      expect(resultado.success).toBe(false);
    });
  });

  describe('CPF', () => {
    it('valida dígitos verificadores', () => {
      expect(cpfValido('52998224725')).toBe(true);
      expect(cpfValido('11144477735')).toBe(true);
      expect(cpfValido('52998224726')).toBe(false);
      expect(cpfValido('11111111111')).toBe(false);
      expect(cpfValido('1234567890')).toBe(false);
    });

    it('aceita com ou sem máscara e rejeita inválido', () => {
      expect(validar({ cpf_solicitante: '52998224725' }).success).toBe(true);
      expect(validar({ cpf_solicitante: '529.982.247-26' }).success).toBe(false);
      expect(validar({ cpf_solicitante: '111.111.111-11' }).success).toBe(false);
      expect(validar({ cpf_solicitante: 'abc' }).success).toBe(false);
    });
  });

  describe('tipo institucional', () => {
    it('exige o nome da instituição para INSTITUICAO', () => {
      expect(validar({ tipo_solicitante: 'INSTITUICAO' }).success).toBe(false);
      expect(validar({ tipo_solicitante: 'INSTITUICAO', nome_instituicao: 'Hospital Teste' }).success).toBe(true);
    });

    it('rejeita nome de instituição para pessoa física e tipo desconhecido', () => {
      expect(validar({ nome_instituicao: 'Hospital Teste' }).success).toBe(false);
      expect(validar({ tipo_solicitante: 'OUTRO' }).success).toBe(false);
    });
  });

  describe('número do imóvel', () => {
    it('exige número ou a marcação sem número, nunca os dois', () => {
      expect(validar({ numero_imovel: undefined }).success).toBe(false);
      expect(validar({ numero_imovel: undefined, sem_numero_imovel: true }).success).toBe(true);
      expect(validar({ numero_imovel: '10', sem_numero_imovel: true }).success).toBe(false);
    });
  });

  describe('coordenadas', () => {
    it('aceita o par completo ou nenhuma', () => {
      expect(validar({ latitude_ocorrencia: -10.9, longitude_ocorrencia: -37.07 }).success).toBe(true);
      expect(validar({ latitude_ocorrencia: -10.9 }).success).toBe(false);
      expect(validar({ longitude_ocorrencia: -37.07 }).success).toBe(false);
    });

    it('rejeita fora do intervalo e valores não numéricos', () => {
      expect(validar({ latitude_ocorrencia: 91, longitude_ocorrencia: 0 }).success).toBe(false);
      expect(validar({ latitude_ocorrencia: 0, longitude_ocorrencia: -181 }).success).toBe(false);
      expect(validar({ latitude_ocorrencia: '1', longitude_ocorrencia: '2' }).success).toBe(false);
    });
  });

  describe('data e hora da ocorrência', () => {
    it('rejeita data futura, sem fuso e inválida', () => {
      expect(validar({ data_hora_ocorrencia: '2026-11-27T20:00:00-03:00' }).success).toBe(false);
      expect(validar({ data_hora_ocorrencia: '2026-11-27T10:30:00' }).success).toBe(false);
      expect(validar({ data_hora_ocorrencia: 'ontem' }).success).toBe(false);
    });

    it('aceita até a tolerância de relógio adiantado', () => {
      expect(validar({ data_hora_ocorrencia: '2026-11-27T15:04:00.000Z' }).success).toBe(true);
      expect(validar({ data_hora_ocorrencia: '2026-11-27T15:06:00.000Z' }).success).toBe(false);
    });
  });

  describe('limites de tamanho (ADR-07 / schema da SCRUM-263)', () => {
    it('endereço até 255 e descrição até 2000', () => {
      expect(validar({ local_ocorrencia: 'a'.repeat(255) }).success).toBe(true);
      expect(validar({ local_ocorrencia: 'a'.repeat(256) }).success).toBe(false);
      expect(validar({ descricao_ocorrencia: 'a'.repeat(2000) }).success).toBe(true);
      expect(validar({ descricao_ocorrencia: 'a'.repeat(2001) }).success).toBe(false);
      expect(validar({ informacoes_medicas: 'a'.repeat(2001) }).success).toBe(false);
      expect(validar({ complemento_ocorrencia: 'a'.repeat(121) }).success).toBe(false);
      expect(validar({ numero_imovel: 'a'.repeat(31) }).success).toBe(false);
    });

    it('rejeita mínimos e caracteres de controle', () => {
      expect(validar({ nome_solicitante: 'A' }).success).toBe(false);
      expect(validar({ descricao_ocorrencia: 'abc' }).success).toBe(false);
      expect(validar({ nome_falecido: 'Joao\u0000Teste' }).success).toBe(false);
    });
  });

  describe('contato e aviso de privacidade', () => {
    it('rejeita e-mail e telefone inválidos', () => {
      expect(validar({ email_solicitante: 'sem-arroba' }).success).toBe(false);
      expect(validar({ telefone_solicitante: 'abcdefgh' }).success).toBe(false);
      expect(validar({ telefone_solicitante: '--------' }).success).toBe(false);
    });

    it('exige ciência do aviso e a versão', () => {
      expect(validar({ ciencia_aviso_privacidade: false }).success).toBe(false);
      expect(validar({ ciencia_aviso_privacidade: undefined }).success).toBe(false);
      expect(validar({ versao_aviso_privacidade: '' }).success).toBe(false);
    });
  });

  it('não repete dados pessoais nas mensagens de erro', () => {
    const resultado = validar({
      cpf_solicitante: '529.982.247-26',
      nome_solicitante: 'Nome Sentinela Unico',
      email_solicitante: 'sentinela@example',
      descricao_ocorrencia: 'x',
      campo_extra: 'valor-sentinela-extra',
    });
    expect(resultado.success).toBe(false);
    const texto = mensagens(resultado);
    for (const sentinela of ['529.982.247-26', '52998224726', 'Nome Sentinela Unico', 'sentinela@example', 'valor-sentinela-extra']) {
      expect(texto).not.toContain(sentinela);
    }
  });
});
