// SCRUM-308: inventário somente leitura das CNHs em `motoristas` antes da restrição de unicidade.
// Mostra contagens e, para colisões, apenas ids e os 4 dígitos finais. Nunca imprime o número completo.
// Uso: npm run db:inventariar-cnh
const path = require('path');

const CATEGORIAS_APROVADAS = new Set(['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']);
const VALIDADE_MINIMA = '2000-01-01';
const VALIDADE_MAXIMA = '2099-12-31';

const canonica = (numero) => String(numero).trim().replace(/[\s.-]/g, '');

function formato(numero) {
  const bruto = String(numero);
  const c = canonica(bruto);
  if (/[^\d\s.-]/.test(bruto)) return 'COM_CARACTERES_NAO_NUMERICOS';
  if (c.length !== 11) return 'COMPRIMENTO_DIFERENTE_DE_11';
  if (/^(\d)\1+$/.test(c)) return 'DIGITOS_REPETIDOS';
  return c === bruto ? 'ONZE_DIGITOS' : 'ONZE_DIGITOS_COM_SEPARADORES';
}

const somar = (mapa, chave) => mapa.set(chave, (mapa.get(chave) ?? 0) + 1);

/**
 * @param {{ id: number, usuario_id: number | null, numero_cnh: string, categoria_cnh: string, validade_cnh: string }[]} linhas
 * @param {string} hoje AAAA-MM-DD
 */
function inventariar(linhas, hoje) {
  const formatos = new Map();
  const categorias = new Map();
  const porCanonico = new Map();
  const porUsuario = new Map();
  let validadeForaDosLimites = 0;
  let vencidas = 0;
  let semUsuario = 0;

  for (const linha of linhas) {
    somar(formatos, formato(linha.numero_cnh));
    const categoria = String(linha.categoria_cnh).trim().toUpperCase();
    somar(categorias, CATEGORIAS_APROVADAS.has(categoria) ? categoria : `FORA_DA_LISTA:${categoria}`);
    if (linha.validade_cnh < VALIDADE_MINIMA || linha.validade_cnh > VALIDADE_MAXIMA) validadeForaDosLimites += 1;
    if (linha.validade_cnh < hoje) vencidas += 1;
    const c = canonica(linha.numero_cnh);
    porCanonico.set(c, [...(porCanonico.get(c) ?? []), linha.id]);
    if (linha.usuario_id == null) semUsuario += 1;
    else porUsuario.set(linha.usuario_id, [...(porUsuario.get(linha.usuario_id) ?? []), linha.id]);
  }

  const colisoesCnh = [...porCanonico.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([c, ids]) => ({ final: c.slice(-4), ids }));
  const colisoesUsuario = [...porUsuario.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([usuario_id, ids]) => ({ usuario_id, ids }));

  return {
    total: linhas.length,
    formatos: Object.fromEntries(formatos),
    categorias: Object.fromEntries(categorias),
    validadeForaDosLimites,
    vencidas,
    semUsuario,
    colisoesCnh,
    colisoesUsuario,
    podeAplicarRestricao: colisoesCnh.length === 0 && colisoesUsuario.length === 0,
  };
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  const knex = require('knex');
  const knexConfig = require('../knexfile');
  const db = knex(knexConfig);
  try {
    const linhas = await db('motoristas').select(
      'id',
      'usuario_id',
      'numero_cnh',
      'categoria_cnh',
      db.raw("to_char(validade_cnh, 'YYYY-MM-DD') AS validade_cnh")
    );
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    console.log(JSON.stringify(inventariar(linhas, hoje), null, 2));
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((erro) => {
    console.error(`Falha no inventário: ${erro.message}`);
    process.exitCode = 1;
  });
}

module.exports = { inventariar, formato, canonica };
