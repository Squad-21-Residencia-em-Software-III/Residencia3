
import '../../knexfile';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../config/database';
import { auditoriaModel } from '../models/auditoriaModel';

const bancoTestes = 'frotas_svo_testes_bl04';

if (process.env.RUN_DB_INTEGRATION === 'true' &&
  process.env.POSTGRES_DB !== bancoTestes) 
  {
  throw new Error(
    `Teste bloqueado: POSTGRES_DB deve ser ${bancoTestes}`
  );
}

const executarIntegracao =
  process.env.RUN_DB_INTEGRATION === 'true';

describe.skipIf(!executarIntegracao)(
  'Integração BL04 - PostgreSQL real',
  () => {
  afterAll(async () => {
    await db.destroy();
  });

  it('deve consultar a segunda página com ordenação correta', async () => {
    const resultado = await auditoriaModel.listar(2, 2);

    expect(resultado.total).toBe(5);
    expect(resultado.dados).toHaveLength(2);

    expect(
      resultado.dados.map((registro) => registro.id)
    ).toEqual([3, 2]);
  });

  it('deve consultar a primeira página com ordenação correta', async () => {
    const resultado = await auditoriaModel.listar(1, 2);

    expect(resultado.total).toBe(5);
    expect(resultado.dados).toHaveLength(2);

    expect(
      resultado.dados.map((registro) => registro.id)
    ).toEqual([5, 4]);
  });
});
