const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');

const MAGIC_HEADER = Buffer.from('SVOBKP01', 'ascii');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MIN_SECRET_LENGTH = 16;

const TABELAS_IGNORADAS = new Set(['knex_migrations', 'knex_migrations_lock']);

/**
 * Normaliza qualquer valor ou linha via serializacao JSON canonica (chaves ordenadas)
 * para garantir que tipos Date/Numeric do driver pg produzam o mesmo hash antes e apos o restore.
 */
function canonizarObjeto(valor) {
  const Normalizado = JSON.parse(JSON.stringify(valor ?? null));
  return ordenarChavesRecursivo(Normalizado);
}

function ordenarChavesRecursivo(item) {
  if (Array.isArray(item)) {
    return item.map(ordenarChavesRecursivo);
  }
  if (item !== null && typeof item === 'object') {
    const ordenado = {};
    for (const chave of Object.keys(item).sort()) {
      ordenado[chave] = ordenarChavesRecursivo(item[chave]);
    }
    return ordenado;
  }
  return item;
}

/**
 * Calcula hash SHA-256 deterministico do conjunto de registros de uma tabela.
 * @param {Array<Record<string, unknown>>} linhas
 * @returns {string}
 */
function calcularHashTabela(linhas) {
  const linhasCanonicas = (linhas || []).map((linha) => JSON.stringify(canonizarObjeto(linha)));
  linhasCanonicas.sort();
  return crypto.createHash('sha256').update(linhasCanonicas.join('\n'), 'utf8').digest('hex');
}

/**
 * Ordena as tabelas topologicamente com base nas chaves estrangeiras (pais antes de filhos).
 * @param {string[]} tabelas
 * @param {Array<{ tabela: string, referencia: string }>} relacoesFk
 * @returns {string[]}
 */
function ordenarTabelasTopologicamente(tabelas, relacoesFk) {
  const conjuntoTabelas = new Set(tabelas);
  const dependencias = new Map();

  for (const t of [...tabelas].sort()) {
    dependencias.set(t, new Set());
  }

  for (const rel of relacoesFk || []) {
    if (
      conjuntoTabelas.has(rel.tabela) &&
      conjuntoTabelas.has(rel.referencia) &&
      rel.tabela !== rel.referencia
    ) {
      dependencias.get(rel.tabela).add(rel.referencia);
    }
  }

  const visitados = new Set();
  const emVisita = new Set();
  const resultado = [];

  function visitar(tabela) {
    if (visitados.has(tabela)) return;
    if (emVisita.has(tabela)) return; // evita ciclo caso haja auto-referencia ou ciclo

    emVisita.add(tabela);
    const pais = [...(dependencias.get(tabela) || [])].sort();
    for (const pai of pais) {
      visitar(pai);
    }
    emVisita.delete(tabela);
    visitados.add(tabela);
    resultado.push(tabela);
  }

  for (const tabela of [...tabelas].sort()) {
    visitar(tabela);
  }

  return resultado;
}

/**
 * Comprime (gzip) e criptografa o payload do backup com AES-256-GCM e chave derivada via scrypt.
 * @param {Record<string, unknown>} payload
 * @param {string} chaveSecreta
 */
function criptografarPayloadBackup(payload, chaveSecreta) {
  if (!chaveSecreta || typeof chaveSecreta !== 'string' || chaveSecreta.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY invalida: informe uma chave com pelo menos ${MIN_SECRET_LENGTH} caracteres.`
    );
  }

  const jsonPayload = JSON.stringify(payload);
  const sha256Payload = crypto.createHash('sha256').update(jsonPayload, 'utf8').digest('hex');
  const comprimido = zlib.gzipSync(Buffer.from(jsonPayload, 'utf8'), {
    level: zlib.constants.Z_BEST_COMPRESSION,
  });

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const chaveDerivada = crypto.scryptSync(chaveSecreta.trim(), salt, KEY_LENGTH);

  const cipher = crypto.createCipheriv('aes-256-gcm', chaveDerivada, iv);
  cipher.setAAD(MAGIC_HEADER);

  const criptografado = Buffer.concat([cipher.update(comprimido), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const bufferFinal = Buffer.concat([MAGIC_HEADER, salt, iv, authTag, criptografado]);
  const sha256Arquivo = crypto.createHash('sha256').update(bufferFinal).digest('hex');

  return {
    buffer: bufferFinal,
    sha256Payload,
    sha256Arquivo,
    tamanhoBytesOriginal: Buffer.byteLength(jsonPayload, 'utf8'),
    tamanhoBytesCriptografado: bufferFinal.length,
  };
}

/**
 * Valida a autenticidade (AES-256-GCM AuthTag + AAD), descriptografa e descomprime um backup.
 * @param {Buffer} bufferCriptografado
 * @param {string} chaveSecreta
 */
function descriptografarPayloadBackup(bufferCriptografado, chaveSecreta) {
  if (!chaveSecreta || typeof chaveSecreta !== 'string' || chaveSecreta.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY invalida: informe uma chave com pelo menos ${MIN_SECRET_LENGTH} caracteres.`
    );
  }

  const tamanhoMinimo = MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
  if (!Buffer.isBuffer(bufferCriptografado) || bufferCriptografado.length < tamanhoMinimo) {
    throw new Error('Arquivo de backup invalido ou truncado.');
  }

  const cabecalho = bufferCriptografado.subarray(0, MAGIC_HEADER.length);
  if (!cabecalho.equals(MAGIC_HEADER)) {
    throw new Error('Assinatura de cabecalho do backup invalida (esperado SVOBKP01).');
  }

  let offset = MAGIC_HEADER.length;
  const salt = bufferCriptografado.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  const iv = bufferCriptografado.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const authTag = bufferCriptografado.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;

  const ciphertext = bufferCriptografado.subarray(offset);
  const chaveDerivada = crypto.scryptSync(chaveSecreta.trim(), salt, KEY_LENGTH);

  let comprimido;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', chaveDerivada, iv);
    decipher.setAAD(MAGIC_HEADER);
    decipher.setAuthTag(authTag);
    comprimido = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error(
      'Falha na verificacao de integridade criptografica (AES-256-GCM): chave incorreta ou arquivo adulterado.'
    );
  }

  const jsonPayload = zlib.gunzipSync(comprimido).toString('utf8');
  const sha256Payload = crypto.createHash('sha256').update(jsonPayload, 'utf8').digest('hex');
  const sha256Arquivo = crypto.createHash('sha256').update(bufferCriptografado).digest('hex');

  return {
    payload: JSON.parse(jsonPayload),
    sha256Payload,
    sha256Arquivo,
  };
}

/**
 * Remove arquivos de backup antigos que ultrapassaram a janela de retencao,
 * preservando sempre pelo menos o backup mais recente.
 * @param {string} diretorioBackup
 * @param {number} diasRetencao
 * @param {Date} [agora]
 */
function aplicarPoliticaRetencao(diretorioBackup, diasRetencao, agora = new Date()) {
  if (!fs.existsSync(diretorioBackup)) {
    return { removidos: [], mantidos: [] };
  }

  const limiteMs = Math.max(1, Number(diasRetencao) || 7) * 24 * 60 * 60 * 1000;
  const arquivosEnc = fs
    .readdirSync(diretorioBackup)
    .filter((nome) => nome.endsWith('.backup.enc'))
    .map((nome) => {
      const caminhoEnc = path.join(diretorioBackup, nome);
      const stats = fs.statSync(caminhoEnc);
      return {
        nome,
        caminhoEnc,
        caminhoMeta: caminhoEnc.replace(/\.backup\.enc$/, '.backup.meta.json'),
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const removidos = [];
  const mantidos = [];

  arquivosEnc.forEach((item, indice) => {
    const idadeMs = agora.getTime() - item.mtimeMs;
    // Sempre preserva o backup mais recente (indice === 0)
    if (indice === 0 || idadeMs <= limiteMs) {
      mantidos.push(item.nome);
      return;
    }

    fs.unlinkSync(item.caminhoEnc);
    if (fs.existsSync(item.caminhoMeta)) {
      fs.unlinkSync(item.caminhoMeta);
    }
    removidos.push(item.nome);
  });

  return { removidos, mantidos };
}

/**
 * Executa o backup completo das tabelas da aplicacao no PostgreSQL.
 */
async function executarBackup() {
  const chaveCriptografia = process.env.BACKUP_ENCRYPTION_KEY;
  if (!chaveCriptografia || chaveCriptografia.trim().length < MIN_SECRET_LENGTH) {
    console.error(
      `Defina BACKUP_ENCRYPTION_KEY (minimo de ${MIN_SECRET_LENGTH} caracteres) no arquivo .env antes de executar o backup.`
    );
    process.exit(1);
  }

  const diasRetencao = Number(process.env.BACKUP_RETENTION_DAYS) || 7;
  const pastaRelativa = process.env.BACKUP_DIR || 'backups';
  const raizProjeto = path.resolve(__dirname, '../../..');
  const diretorioBackup = path.resolve(raizProjeto, pastaRelativa);

  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });

  const db = knex(configMigration);
  const inicioMs = Date.now();

  try {
    const { rows: infoRows } = await db.raw(`
      SELECT
        current_database() AS database_name,
        current_user AS executed_by,
        current_setting('server_version') AS server_version,
        NOW() AS captured_at
    `);
    const infoBanco = infoRows[0];

    const { rows: tabelasRows } = await db.raw(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const todasTabelas = tabelasRows
      .map((r) => r.table_name)
      .filter((nome) => !TABELAS_IGNORADAS.has(nome));

    const { rows: fksRows } = await db.raw(`
      SELECT
        tc.table_name AS tabela,
        ccu.table_name AS referencia,
        tc.constraint_name AS constraint_name,
        kcu.column_name AS coluna,
        ccu.column_name AS coluna_referenciada
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name
    `);

    const ordemTabelas = ordenarTabelasTopologicamente(todasTabelas, fksRows);

    const { rows: sequencesRows } = await db.raw(`
      SELECT sequencename, last_value
      FROM pg_sequences
      WHERE schemaname = 'public'
      ORDER BY sequencename
    `);

    const dadosTabelas = {};
    const resumoTabelas = {};
    let totalRegistros = 0;

    for (const nomeTabela of ordemTabelas) {
      const registrosBrutos = await db.withSchema('public').select('*').from(nomeTabela);
      const registrosCanonicos = canonizarObjeto(registrosBrutos);
      const hashTabela = calcularHashTabela(registrosCanonicos);

      dadosTabelas[nomeTabela] = registrosCanonicos;
      resumoTabelas[nomeTabela] = {
        totalRegistros: registrosCanonicos.length,
        sha256: hashTabela,
      };
      totalRegistros += registrosCanonicos.length;
    }

    const timestampIso = new Date().toISOString();
    const sufixoData = timestampIso.replace(/[:.]/g, '-');
    const nomeBase = `backup-${infoBanco.database_name}-${sufixoData}`;

    const payloadBackup = {
      formato: 'SVOBKP01',
      geradoEm: timestampIso,
      banco: {
        nome: infoBanco.database_name,
        versaoServidor: infoBanco.server_version,
        usuarioExecucao: infoBanco.executed_by,
        host: configMigration.connection.host,
        tlsAtivo: Boolean(configMigration.connection.ssl),
      },
      ordemRestauracao: ordemTabelas,
      chavesEstrangeiras: fksRows,
      sequences: sequencesRows,
      resumoTabelas,
      tabelas: dadosTabelas,
    };

    const resultadoCriptografia = criptografarPayloadBackup(payloadBackup, chaveCriptografia);

    fs.mkdirSync(diretorioBackup, { recursive: true });
    const caminhoEnc = path.join(diretorioBackup, `${nomeBase}.backup.enc`);
    const caminhoMeta = path.join(diretorioBackup, `${nomeBase}.backup.meta.json`);

    fs.writeFileSync(caminhoEnc, resultadoCriptografia.buffer, { mode: 0o600 });

    const manifesto = {
      arquivoBackup: path.basename(caminhoEnc),
      formato: 'SVOBKP01',
      algoritmoCriptografia: 'AES-256-GCM (KDF: scrypt, compressao: gzip)',
      geradoEm: timestampIso,
      duracaoMs: Date.now() - inicioMs,
      banco: payloadBackup.banco,
      totalTabelas: ordemTabelas.length,
      totalRegistros,
      tamanhoBytesOriginal: resultadoCriptografia.tamanhoBytesOriginal,
      tamanhoBytesCriptografado: resultadoCriptografia.tamanhoBytesCriptografado,
      sha256Payload: resultadoCriptografia.sha256Payload,
      sha256ArquivoCriptografado: resultadoCriptografia.sha256Arquivo,
      ordemRestauracao: ordemTabelas,
      resumoTabelas,
    };

    fs.writeFileSync(caminhoMeta, JSON.stringify(manifesto, null, 2), { mode: 0o600 });

    const retencao = aplicarPoliticaRetencao(diretorioBackup, diasRetencao);

    console.log('Backup concluido e criptografado com sucesso:');
    console.log(`  Arquivo criptografado : ${caminhoEnc}`);
    console.log(`  Manifesto de metadados: ${caminhoMeta}`);
    console.log(`  Algoritmo             : ${manifesto.algoritmoCriptografia}`);
    console.log(`  Tabelas exportadas    : ${manifesto.totalTabelas} (${totalRegistros} registros)`);
    console.log(`  SHA-256 (arquivo)     : ${manifesto.sha256ArquivoCriptografado}`);
    console.log(`  SHA-256 (payload)     : ${manifesto.sha256Payload}`);
    console.log(
      `  Retencao (${diasRetencao} dias)     : ${retencao.mantidos.length} mantido(s), ${retencao.removidos.length} expurgado(s)`
    );

    return { caminhoEnc, caminhoMeta, manifesto, retencao };
  } finally {
    await db.destroy();
  }
}

module.exports = {
  MAGIC_HEADER,
  canonizarObjeto,
  calcularHashTabela,
  ordenarTabelasTopologicamente,
  criptografarPayloadBackup,
  descriptografarPayloadBackup,
  aplicarPoliticaRetencao,
  executarBackup,
};

if (require.main === module) {
  executarBackup().catch((erro) => {
    console.error('Falha ao executar rotina de backup:', erro.message);
    process.exit(1);
  });
}
