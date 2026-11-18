import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';
vi.mock('../config/env', () => ({ env: { jwtSecret: 'segredo-local-de-teste-com-mais-de-32-caracteres' } }));
import { validarAgendaSvo, type DadosAgendaSvo, type ReservaSvo } from '../services/agendaSvoService';

const reserva: ReservaSvo = {
  id: 8, status: 'ALOCADA', veiculo_id: 2, motorista_id: 3, equipe_id: 4,
  inicio_previsto: '2099-01-01T14:00:00Z', fim_previsto: '2099-01-01T16:00:00Z',
};
const dados = (minutos: number): DadosAgendaSvo => ({
  ordemId: 9, autorId: 12, veiculoId: 2, motoristaId: 3, equipeId: 4,
  inicio: new Date(Date.parse('2099-01-01T16:00:00Z') + minutos * 60_000),
  fim: new Date(Date.parse('2099-01-01T17:00:00Z') + minutos * 60_000),
});
function conexao(reservas: ReservaSvo[]): Knex.Transaction {
  const q: Record<string, unknown> = {};
  for (const nome of ['whereIn', 'whereNot', 'andWhere', 'select']) q[nome] = () => q;
  q.orderBy = async () => reservas;
  return (() => q) as unknown as Knex.Transaction;
}
async function desafio(input: DadosAgendaSvo, reservas = [reserva]) {
  try { await validarAgendaSvo(conexao(reservas), input); throw new Error('Deveria exigir confirmação'); }
  catch (erro) { return erro as { codigo: string; contexto: { token_confirmacao: string; conflitos: unknown[] } }; }
}

describe('agenda temporal SVO', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it.each((['EM_DESLOCAMENTO', 'NO_LOCAL'] as const).flatMap((status) =>
    ['veiculo', 'motorista', 'equipe'].map((recurso) => ({ status, recurso })),
  ))('bloqueia $recurso ocupado em $status mesmo após o horário previsto', async ({ status, recurso }) => {
    vi.setSystemTime(new Date('2099-01-01T16:40:00Z'));
    const ocupada = { ...reserva, status,
      veiculo_id: recurso === 'veiculo' ? 2 : 20,
      motorista_id: recurso === 'motorista' ? 3 : 30,
      equipe_id: recurso === 'equipe' ? 4 : 40 };
    await expect(validarAgendaSvo(conexao([ocupada]), dados(45)))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'CONFLITO_AGENDA' });
  });

  it.each([0, 10, 19])('exige confirmação para folga de %i minutos', async (minutos) => {
    const erro = await desafio(dados(minutos));
    expect(erro.codigo).toBe('CONFIRMACAO_INTERVALO_REDUZIDO');
    expect(erro.contexto.conflitos).toHaveLength(3);
    expect(await validarAgendaSvo(conexao([reserva]), {
      ...dados(minutos), confirmar: true, token: erro.contexto.token_confirmacao,
    })).toHaveLength(3);
  });
  it.each([20, 30])('aceita folga de %i minutos sem confirmação', async (minutos) => {
    expect(await validarAgendaSvo(conexao([reserva]), dados(minutos))).toEqual([]);
  });
  it('bloqueia sobreposição mesmo quando o cliente envia confirmação', async () => {
    const token = (await desafio(dados(10))).contexto.token_confirmacao;
    await expect(validarAgendaSvo(conexao([reserva]), { ...dados(-10), confirmar: true, token }))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'CONFLITO_AGENDA' });
  });
  it('não aceita desafio de outro autor, outro horário ou reservas alteradas', async () => {
    const token = (await desafio(dados(10))).contexto.token_confirmacao;
    for (const alterado of [
      { ...dados(10), autorId: 13, confirmar: true, token },
      { ...dados(11), confirmar: true, token },
    ]) await expect(validarAgendaSvo(conexao([reserva]), alterado))
      .rejects.toMatchObject({ codigo: 'CONFIRMACAO_INTERVALO_REDUZIDO' });
    await expect(validarAgendaSvo(conexao([{ ...reserva, id: 10 }]), { ...dados(10), confirmar: true, token }))
      .rejects.toMatchObject({ codigo: 'CONFIRMACAO_INTERVALO_REDUZIDO' });
  });
  it('não aceita desafio expirado nem booleano isolado', async () => {
    const token = (await desafio(dados(10))).contexto.token_confirmacao;
    vi.advanceTimersByTime(301_000);
    await expect(validarAgendaSvo(conexao([reserva]), { ...dados(10), confirmar: true, token }))
      .rejects.toMatchObject({ codigo: 'CONFIRMACAO_INTERVALO_REDUZIDO' });
    await expect(validarAgendaSvo(conexao([reserva]), { ...dados(10), confirmar: true }))
      .rejects.toMatchObject({ codigo: 'CONFIRMACAO_INTERVALO_REDUZIDO' });
  });
  it('bloqueia reservas legadas sem período e datas inválidas', async () => {
    await expect(validarAgendaSvo(conexao([{ ...reserva, inicio_previsto: null }]), dados(30)))
      .rejects.toMatchObject({ codigo: 'CONFLITO_AGENDA' });
    await expect(validarAgendaSvo(conexao([]), { ...dados(30), fim: new Date('2099-01-01T13:00:00Z') }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
