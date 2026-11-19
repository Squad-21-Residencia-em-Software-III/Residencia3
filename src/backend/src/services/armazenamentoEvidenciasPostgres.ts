import type { Knex } from 'knex';
import { AppError } from '../errors/AppError';
import type { ArmazenamentoEvidencias } from './armazenamentoEvidencias';
import { limiteLeituraEvidencia, validarChave } from './chavesEvidencias';
import { LIMITE_FOTO_ARMAZENADA } from './imagemEvidencias';

export const TABELA_ARQUIVOS_ODOMETRO = 'evidencias_odometro_arquivos';

export function armazenamentoPostgres(db: Knex, limiteArmazenadoBytes: () => number): ArmazenamentoEvidencias {
  return {
    async salvar(chave, conteudo, trx) {
      validarChave(chave);
      if (!trx) throw new Error('O upload para PostgreSQL exige a transação da evidência');
      if (!conteudo.length || conteudo.length > LIMITE_FOTO_ARMAZENADA) {
        throw new AppError('A foto processada ultrapassa o tamanho permitido', 413);
      }
      const evidencia = await trx('evidencias_odometro').where({ storage_key: chave }).first('id', 'tamanho_bytes');
      if (!evidencia || evidencia.tamanho_bytes !== conteudo.length) {
        throw new AppError('Reserva da foto inválida', 502);
      }
      // Serializa a checagem de espaço e a inserção entre réplicas, inclusive para viagens diferentes.
      await trx.raw('SELECT pg_advisory_xact_lock(211, 1)');
      const anterior = await trx(TABELA_ARQUIVOS_ODOMETRO).where({ evidencia_id: evidencia.id }).first('conteudo');
      if (anterior) {
        if (!anterior.conteudo.equals(conteudo)) {
          throw new AppError('Esta chave já está associada a outro conteúdo', 409);
        }
        return;
      }
      const [{ total }] = await trx(TABELA_ARQUIVOS_ODOMETRO).sum('tamanho_bytes as total');
      if (Number(total) + conteudo.length > limiteArmazenadoBytes()) {
        throw new AppError('O armazenamento de fotos atingiu o limite do projeto', 409, 'EVIDENCIAS_LIMITE_ARMAZENAMENTO');
      }
      await trx(TABELA_ARQUIVOS_ODOMETRO).insert({
        evidencia_id: evidencia.id, tamanho_bytes: conteudo.length, conteudo,
      });
    },
    async ler(chave, maxBytes = limiteLeituraEvidencia, trx) {
      const conexao = trx ?? db;
      const arquivo = await conexao(`${TABELA_ARQUIVOS_ODOMETRO} as a`)
        .join('evidencias_odometro as e', 'e.id', 'a.evidencia_id')
        .where('e.storage_key', validarChave(chave))
        .first(conexao.raw('CASE WHEN a.tamanho_bytes <= ? THEN a.conteudo END AS conteudo', [maxBytes]));
      if (!arquivo) throw new AppError('O arquivo da foto não foi encontrado no armazenamento', 404);
      if (!Buffer.isBuffer(arquivo.conteudo)) throw new AppError('Tamanho da evidência inválido', 502);
      return arquivo.conteudo;
    },
  };
}
