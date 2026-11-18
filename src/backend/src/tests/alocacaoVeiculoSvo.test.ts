import { describe, expect, it } from 'vitest';

import {
  CAPACIDADE_MAXIMA_SVO,
  STATUS_ORDEM_SVO_OCUPA_VAGA,
  STATUS_VEICULO_SVO_ALOCAVEL,
} from '../constants/veiculoSvo';
import {
  capacidadeEfetiva,
  validarVeiculoParaOrdemSvo,
  vagasDisponiveis,
  type OrdemDoVeiculo,
  type VeiculoParaAlocacao,
} from '../services/alocacaoVeiculoSvo';

const veiculo = (alteracoes: Partial<VeiculoParaAlocacao> = {}): VeiculoParaAlocacao => ({
  tipo_frota: 'SVO',
  status: 'DISPONIVEL',
  capacidade_maxima: 4,
  ...alteracoes,
});

const ordem = (alteracoes: Partial<OrdemDoVeiculo> = {}): OrdemDoVeiculo => ({
  motorista_id: 20,
  capacidade_utilizada: 1,
  status: 'ALOCADA',
  ...alteracoes,
});

// Captura o erro lançado (ou undefined), no mesmo estilo dos demais testes de regra
const erroDe = (acao: () => void): unknown => {
  try {
    acao();
  } catch (erro) {
    return erro;
  }
  return undefined;
};

const pedido = (alteracoes: Partial<{ motoristaId: number; capacidade: number }> = {}) => ({
  motoristaId: 20,
  capacidade: 1,
  ...alteracoes,
});

describe('regras de capacidade (RN11 e RN12)', () => {
  it('limita a capacidade efetiva ao teto de 4 óbitos, mesmo que o cadastro seja maior', () => {
    expect(capacidadeEfetiva(2)).toBe(2);
    expect(capacidadeEfetiva(4)).toBe(4);
    expect(capacidadeEfetiva(6)).toBe(4);
    expect(capacidadeEfetiva(0)).toBe(0);
    expect(capacidadeEfetiva(-3)).toBe(0);
  });

  it('calcula as vagas pela soma das ordens que ocupam o veículo', () => {
    expect(vagasDisponiveis(veiculo(), [])).toBe(4);
    expect(vagasDisponiveis(veiculo(), [ordem({ capacidade_utilizada: 3 })])).toBe(1);
    expect(vagasDisponiveis(veiculo(), [ordem({ capacidade_utilizada: 3 }), ordem()])).toBe(0);
  });

  it('não considera ordens que não ocupam vaga e nunca devolve vagas negativas', () => {
    expect(vagasDisponiveis(veiculo(), [ordem({ status: 'CONCLUIDA', capacidade_utilizada: 4 })])).toBe(4);
    expect(vagasDisponiveis(veiculo(), [ordem({ capacidade_utilizada: 9 })])).toBe(0);
  });

  it('usa o teto de 4 ao calcular as vagas de um veículo cadastrado com capacidade maior', () => {
    expect(vagasDisponiveis(veiculo({ capacidade_maxima: 6 }), [ordem({ capacidade_utilizada: 3 })])).toBe(1);
  });

  it.each([1, 2, 3, 4])('permite alocar %i óbito(s) em um veículo vazio', (capacidade) => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo(), [], pedido({ capacidade })))).toBeUndefined();
  });

  it('permite ocupar exatamente a última vaga', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo(), [ordem({ capacidade_utilizada: 3 })], pedido({ capacidade: 1 })))).toBeUndefined();
  });

  it('bloqueia o que passa da última vaga informando as vagas restantes (409)', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo(), [ordem({ capacidade_utilizada: 3 })], pedido({ capacidade: 2 })))).toMatchObject({ statusCode: 409, message: 'O veículo não tem capacidade suficiente (vagas disponíveis: 1)' });
  });

  it('impede nova alocação em veículo lotado (RN12)', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(
        veiculo(),
        [ordem({ capacidade_utilizada: 3 }), ordem({ capacidade_utilizada: 1 })],
        pedido(),
      ))).toMatchObject({ statusCode: 409, message: 'O veículo não tem capacidade suficiente (vagas disponíveis: 0)' });
  });

  it('rejeita pedido acima do teto de 4 óbitos antes de qualquer outra verificação (400)', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo(), [], pedido({ capacidade: 5 })))).toMatchObject({ statusCode: 400 });
    // vale também para veículo cadastrado com capacidade maior que 4
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ capacidade_maxima: 6 }), [], pedido({ capacidade: 5 })))).toMatchObject({ statusCode: 400 });
  });

  it('aplica o teto de 4 a veículo cadastrado com capacidade maior', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ capacidade_maxima: 6 }), [ordem({ capacidade_utilizada: 3 })], pedido({ capacidade: 2 })))).toMatchObject({ statusCode: 409, message: 'O veículo não tem capacidade suficiente (vagas disponíveis: 1)' });
  });

  it('bloqueia veículo sem capacidade cadastrada', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ capacidade_maxima: 0 }), [], pedido()))).toMatchObject({ statusCode: 409 });
  });
});

describe('disponibilidade do veículo (RN10)', () => {
  it.each(STATUS_VEICULO_SVO_ALOCAVEL)('aceita veículo %s', (status) => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ status }), [], pedido()))).toBeUndefined();
  });

  it('aceita veículo RESERVADO que já tem ordem do mesmo motorista e vagas', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ status: 'RESERVADO' }), [ordem({ capacidade_utilizada: 2 })], pedido({ capacidade: 2 })))).toBeUndefined();
  });

  it('rejeita veículo que não é da frota SVO (400)', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ tipo_frota: 'ADMINISTRATIVA' }), [], pedido()))).toMatchObject({ statusCode: 400, message: 'O veículo não pertence à frota SVO' });
  });

  it.each(['EM_USO', 'INATIVO', 'QUALQUER_OUTRO'])('rejeita veículo com status %s (409)', (status) => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ status }), [], pedido()))).toMatchObject({
        statusCode: 409,
        message: `O veículo não está disponível para alocação (situação atual: ${status})`,
      });
  });

  it('rejeita veículo em manutenção (409)', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ status: 'MANUTENCAO' }), [], pedido()))).toMatchObject({ statusCode: 409 });
  });

  it('rejeita veículo em deslocamento, mesmo havendo vagas (409)', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ status: 'EM_USO' }), [ordem({ status: 'EM_DESLOCAMENTO' })], pedido()))).toMatchObject({ statusCode: 409, message: 'O veículo está em deslocamento' });
  });

  it('rejeita veículo já alocado a outro motorista (409)', () => {
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo(), [ordem({ motorista_id: 21 })], pedido()))).toMatchObject({ statusCode: 409, message: 'O veículo já está alocado a outro motorista' });
  });

  it('dá precedência ao motivo mais específico quando há mais de um impedimento', () => {
    // frota errada vence todos os outros
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ tipo_frota: 'ADMINISTRATIVA', status: 'EM_USO' }), [ordem({ status: 'EM_DESLOCAMENTO' })], pedido()))).toMatchObject({ message: 'O veículo não pertence à frota SVO' });
    // deslocamento vence a situação do veículo
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ status: 'EM_USO' }), [ordem({ status: 'EM_DESLOCAMENTO' })], pedido()))).toMatchObject({ message: 'O veículo está em deslocamento' });
    // situação do veículo vence outro motorista e capacidade
    expect(erroDe(() => validarVeiculoParaOrdemSvo(veiculo({ status: 'EM_USO' }), [ordem({ motorista_id: 21, capacidade_utilizada: 4 })], pedido()))).toMatchObject({ message: expect.stringContaining('não está disponível') });
  });
});

describe('constantes da regra', () => {
  it('mantém o teto de 4 óbitos (RN11)', () => {
    expect(CAPACIDADE_MAXIMA_SVO).toBe(4);
  });

  it('considera alocada e em deslocamento como ocupando vaga', () => {
    expect([...STATUS_ORDEM_SVO_OCUPA_VAGA]).toEqual(['ALOCADA', 'EM_DESLOCAMENTO']);
  });
});
