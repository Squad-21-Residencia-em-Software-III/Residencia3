import { describe, expect, it } from 'vitest';
import { motivoPublico } from '../services/metricasNotificacoes';

// SCRUM-241: a métrica só mostra os códigos que a fila grava. Qualquer outro valor vira OUTRO.
describe('motivoPublico', () => {
  it.each([
    'PRAZO_ENCERRADO', 'USUARIO_INATIVO', 'CATEGORIA_DESLIGADA', 'SEM_ASSINATURA', 'ACESSO_REVOGADO',
    'APARELHOS_REJEITADOS', 'PROCESSO_INTERROMPIDO', 'TIMEOUT', 'REDE', 'HTTP_400', 'HTTP_503', 'HTTP_100', 'HTTP_599',
  ])('mantém o código conhecido %s', (codigo) => {
    expect(motivoPublico(codigo)).toBe(codigo);
  });

  it.each([
    ['nulo', null],
    ['texto livre', 'Falhou para fulano@exemplo.com'],
    ['código inventado', 'CODIGO_INVENTADO'],
    ['nome de pessoa em maiúsculas', 'JOAO_DA_SILVA'],
    ['status HTTP inexistente', 'HTTP_600'],
    ['status HTTP curto', 'HTTP_50'],
    ['status HTTP longo', 'HTTP_5000'],
    ['HTTP com texto', 'HTTP_503_fulano'],
    ['minúsculas', 'timeout'],
    ['espaço em volta', ' TIMEOUT '],
    ['ENVIADO não é motivo', 'ENTREGA_PARCIAL'],
  ])('troca %s por OUTRO', (_caso, valor) => {
    expect(motivoPublico(valor)).toBe('OUTRO');
  });
});
