// SCRUM-308: unicidade da CNH pelo valor canônico (sem pontos, hífens e espaços) e um registro de
// motorista por usuário. Não altera nenhuma linha. Se o legado já tiver colisões, a migração aborta
// (transação desfeita, linhas preservadas) e pede o saneamento aprovado antes da restrição integral.
// Inventário: npm run db:inventariar-cnh (docs/scrum-308-cadastro-cnh.md).
const CANONICA = "regexp_replace(numero_cnh, '[[:space:].-]', '', 'g')";

exports.up = async (knex) => {
  const { rows: [colisoes] } = await knex.raw(`
    SELECT
      (SELECT count(*) FROM (SELECT 1 FROM motoristas GROUP BY ${CANONICA} HAVING count(*) > 1) g)::int AS cnh,
      (SELECT count(*) FROM (SELECT 1 FROM motoristas WHERE usuario_id IS NOT NULL
         GROUP BY usuario_id HAVING count(*) > 1) g)::int AS usuario
  `);
  if (colisoes.cnh > 0 || colisoes.usuario > 0) {
    throw new Error(
      `SCRUM-308: saneamento necessário antes da restrição de unicidade. Grupos de CNH equivalente: ${colisoes.cnh}; ` +
      `usuários com mais de um registro de motorista: ${colisoes.usuario}. Nenhuma linha foi alterada. ` +
      'Rode npm run db:inventariar-cnh e siga docs/scrum-308-cadastro-cnh.md.'
    );
  }

  await knex.raw(`
    CREATE UNIQUE INDEX uq_motoristas_numero_cnh_canonico ON motoristas ((${CANONICA}));
    CREATE UNIQUE INDEX uq_motoristas_usuario_id ON motoristas (usuario_id) WHERE usuario_id IS NOT NULL;
  `);
};

exports.down = async (knex) => {
  await knex.raw(`
    DROP INDEX IF EXISTS uq_motoristas_usuario_id;
    DROP INDEX IF EXISTS uq_motoristas_numero_cnh_canonico;
  `);
};
