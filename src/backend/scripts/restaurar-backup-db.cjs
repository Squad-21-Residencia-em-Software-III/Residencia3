const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const {
  canonizarObjeto,
  calcularHashTabela,
  descriptografarPayloadBackup,
} = require('./backup-db.cjs');

/**
 * Compara o resumo esperado do manifesto de backup com os registros lidos do ambiente restaurado.
 * @param {Record<string, { totalRegistros: number, sha256: string }>} resumoEsperado
 * @param {Record<string, Array<Record<string, unknown>>>} tabelasRestauradas
 */
function validarIntegridadeTabelas(resumoEsperado, tabelasRestauradas) {
  const divergencias = [];
  const resultados = [];

  for (const [nomeTabela, esperado] of Object.entries(resumoEsperado || {})) {
    const linhasRestauradas = canonizarObjeto(tabelasRestauradas[nomeTabela] || []);
    const totalRestaurado = linhasRestauradas.length;
    const sha256Restaurado = calcularHashTabela(linhasRestauradas);

    const contagemOk = totalRestaurado === esperado.totalRegistros;
    const hashOk = sha256Restaurado === esperado.sha256;
    const integro = contagemOk && hashOk;

    resultados.push({
      tabela: nomeTabela,
      totalEsperado: esperado.totalRegistros,
      totalRestaurado,
      sha256Esperado: esperado.sha256,
      sha256Restaurado,
      integro,
    });

    if (!integro) {
      divergencias.push(
        `Tabela "${nomeTabela}": esperado (${esperado.totalRegistros} linhas, hash ${esperado.sha256.slice(0, 12)}...), restaurado (${totalRestaurado} linhas, hash ${sha256Restaurado.slice(0, 12)}...)`
      );
    }
  }

  return {
    integro: divergencias.length === 0,
    resultados,
    divergencias,
  };
}

/**
 * Localiza o arquivo .backup.enc mais recente no diretorio de backups.
 * @param {string} diretorioBackup
 */
function localizarBackupMaisRecente(diretorioBackup) {
  if (!fs.existsSync(diretorioBackup)) {
    throw new Error(`Diretorio de backups nao encontrado: ${diretorioBackup}`);
  }

  const arquivos = fs
    .readdirSync(diretorioBackup)
    .filter((nome) => nome.endsWith('.backup.enc'))
    .map((nome) => {
      const caminho = path.join(diretorioBackup, nome);
      return { caminho, mtimeMs: fs.statSync(caminho).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (arquivos.length === 0) {
    throw new Error(`Nenhum arquivo .backup.enc encontrado em ${diretorioBackup}`);
  }

  return arquivos[0].caminho;
}

/**
 * Executa a restauracao de um backup criptografado em um ambiente isolado de validacao
 * (schema separado de producao) e verifica a integridade completa dos dados restaurados.
 */
async function executarRestauracaoValidada(opcoes = {}) {
  const chaveCriptografia = opcoes.chaveCriptografia || process.env.BACKUP_ENCRYPTION_KEY;
  if (!chaveCriptografia) {
    console.error(
      'Defina BACKUP_ENCRYPTION_KEY no arquivo .env antes de executar a restauracao.'
    );
    process.exit(1);
  }

  const pastaRelativa = process.env.BACKUP_DIR || 'backups';
  const raizProjeto = path.resolve(__dirname, '../../..');
  const diretorioBackup = path.resolve(raizProjeto, pastaRelativa);

  const argArquivo = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const manterSchema = process.argv.includes('--manter-schema') || Boolean(opcoes.manterSchema);

  const caminhoEnc = opcoes.caminhoEnc
    ? path.resolve(opcoes.caminhoEnc)
    : argArquivo
      ? path.resolve(argArquivo)
      : localizarBackupMaisRecente(diretorioBackup);

  const caminhoMeta = caminhoEnc.replace(/\.backup\.enc$/, '.backup.meta.json');
  const inicioMs = Date.now();

  const bufferCriptografado = fs.readFileSync(caminhoEnc);
  const { payload, sha256Payload, sha256Arquivo } = descriptografarPayloadBackup(
    bufferCriptografado,
    chaveCriptografia
  );

  if (fs.existsSync(caminhoMeta)) {
    const manifesto = JSON.parse(fs.readFileSync(caminhoMeta, 'utf8'));
    if (manifesto.sha256ArquivoCriptografado !== sha256Arquivo) {
      throw new Error(
        'Divergencia de checksum SHA-256 entre o arquivo .backup.enc e o manifesto .meta.json.'
      );
    }
    if (manifesto.sha256Payload !== sha256Payload) {
      throw new Error(
        'Divergencia de checksum SHA-256 do payload descriptografado em relacao ao manifesto.'
      );
    }
  }

  const schemaTeste = `restore_validacao_${Date.now()}`;
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });

  const db = knex(configMigration);

  try {
    await db.transaction(async (trx) => {
      await trx.raw('CREATE SCHEMA ??', [schemaTeste]);

      const ordemTabelas = payload.ordemRestauracao || Object.keys(payload.tabelas || {});

      // 1. Cria a estrutura isolada de cada tabela no schema de teste (separado do public de producao)
      for (const nomeTabela of ordemTabelas) {
        await trx.raw(
          'CREATE TABLE ??.?? (LIKE public.?? INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)',
          [schemaTeste, nomeTabela, nomeTabela]
        );
      }

      // 2. Insere os dados do backup em ordem topologica
      for (const nomeTabela of ordemTabelas) {
        const registros = payload.tabelas[nomeTabela] || [];
        if (registros.length > 0) {
          await trx.withSchema(schemaTeste).into(nomeTabela).insert(registros);
        }
      }

      // 3. Recria as constraints de chave estrangeira dentro do schema isolado para validar integridade referencial
      const fks = payload.chavesEstrangeiras || [];
      for (const fk of fks) {
        const nomeConstraint = `${fk.constraint_name}_restore_chk`.slice(0, 63);
        await trx.raw(
          'ALTER TABLE ??.?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ??.?? (??)',
          [
            schemaTeste,
            fk.tabela,
            nomeConstraint,
            fk.coluna,
            schemaTeste,
            fk.referencia,
            fk.coluna_referenciada,
          ]
        );
      }
    });

    // 4. Le os dados diretamente do ambiente restaurado e valida contagem + hash SHA-256 de cada tabela
    const tabelasRestauradas = {};
    const ordemTabelas = payload.ordemRestauracao || Object.keys(payload.tabelas || {});
    for (const nomeTabela of ordemTabelas) {
      const linhas = await db.withSchema(schemaTeste).select('*').from(nomeTabela);
      tabelasRestauradas[nomeTabela] = linhas;
    }

    const validacao = validarIntegridadeTabelas(payload.resumoTabelas, tabelasRestauradas);
    if (!validacao.integro) {
      throw new Error(
        `Falha na validacao de integridade pos-restauracao:\n${validacao.divergencias.join('\n')}`
      );
    }

    // 5. Verifica integridade referencial via SQL para todas as chaves estrangeiras
    let orfaosEncontrados = 0;
    for (const fk of payload.chavesEstrangeiras || []) {
      const { rows } = await db.raw(
        `SELECT COUNT(*)::int AS total_orfaos
         FROM ??.?? AS filho
         LEFT JOIN ??.?? AS pai ON filho.?? = pai.??
         WHERE filho.?? IS NOT NULL AND pai.?? IS NULL`,
        [
          schemaTeste,
          fk.tabela,
          schemaTeste,
          fk.referencia,
          fk.coluna,
          fk.coluna_referenciada,
          fk.coluna,
          fk.coluna_referenciada,
        ]
      );
      orfaosEncontrados += rows[0].total_orfaos;
    }

    if (orfaosEncontrados > 0) {
      throw new Error(
        `Foram encontrados ${orfaosEncontrados} registros orfaos nas chaves estrangeiras restauradas.`
      );
    }

    const duracaoMs = Date.now() - inicioMs;

    console.log('Restauracao em ambiente isolado e validacao de integridade concluidas com sucesso:');
    console.log(`  Arquivo restaurado    : ${caminhoEnc}`);
    console.log(`  Ambiente de teste     : schema "${schemaTeste}" (isolado de public)`);
    console.log(`  SHA-256 (arquivo)     : ${sha256Arquivo}`);
    console.log(`  SHA-256 (payload)     : ${sha256Payload}`);
    console.log(`  Tabelas validadas     : ${validacao.resultados.length}`);
    console.log(`  Orfaos em FKs         : ${orfaosEncontrados}`);
    console.log(`  Tempo total (RTO real): ${duracaoMs} ms (${(duracaoMs / 1000).toFixed(2)} s)`);
    for (const item of validacao.resultados) {
      console.log(
        `    - ${item.tabela}: ${item.totalRestaurado}/${item.totalEsperado} registros | SHA-256 OK (${item.sha256Restaurado.slice(0, 16)}...)`
      );
    }

    return {
      caminhoEnc,
      schemaTeste,
      duracaoMs,
      sha256Arquivo,
      sha256Payload,
      orfaosEncontrados,
      resultados: validacao.resultados,
    };
  } finally {
    if (!manterSchema) {
      await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schemaTeste]).catch(() => {});
    }
    await db.destroy();
  }
}

module.exports = {
  validarIntegridadeTabelas,
  localizarBackupMaisRecente,
  executarRestauracaoValidada,
};

if (require.main === module) {
  executarRestauracaoValidada().catch((erro) => {
    console.error('Falha na restauracao ou validacao do backup:', erro.message);
    process.exit(1);
  });
}
