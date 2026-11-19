import { describe, expect, it } from 'vitest';
import { rotuloStatusViagem, viagemEmCurso } from './viagem';

describe('status da viagem e da coleta SVO (BL31)', () => {
  it('mostra "A caminho" no deslocamento da coleta SVO e mantém "Em Andamento" na administrativa', () => {
    expect(rotuloStatusViagem({ tipo_operacao: 'SVO', status: 'EM_ANDAMENTO' })).toBe('A caminho');
    expect(rotuloStatusViagem({ tipo_operacao: 'ADMINISTRATIVA', status: 'EM_ANDAMENTO' })).toBe('Em Andamento');
  });

  it('mostra "No local" e "Concluída" para a coleta SVO', () => {
    expect(rotuloStatusViagem({ tipo_operacao: 'SVO', status: 'NO_LOCAL' })).toBe('No local');
    expect(rotuloStatusViagem({ tipo_operacao: 'SVO', status: 'CONCLUIDA' })).toBe('Concluída');
  });

  it('considera em curso apenas a coleta em deslocamento ou no local', () => {
    expect(viagemEmCurso('EM_ANDAMENTO')).toBe(true);
    expect(viagemEmCurso('NO_LOCAL')).toBe(true);
    expect(['AGENDADA', 'CONCLUIDA', 'CANCELADA'].some((s) => viagemEmCurso(s as never))).toBe(false);
  });
});
