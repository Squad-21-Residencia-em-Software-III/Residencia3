import bcrypt from 'bcryptjs';

const CUSTO_BCRYPT = 10;

export const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente', CUSTO_BCRYPT);

export const senhaService = {
  gerarHash(senha: string): Promise<string> {
    return bcrypt.hash(senha, CUSTO_BCRYPT);
  },

  comparar(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  },
};
