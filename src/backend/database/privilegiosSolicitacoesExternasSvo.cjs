const DADOS = 'solicitacoes_svo_dados_externos';
const CREDENCIAIS = 'solicitacoes_svo_credenciais_externas';
const RECUPERACOES = 'solicitacoes_svo_recuperacoes_tentativa';

const CONTATO_LOCAL = [
  'telefone_solicitante', 'email_solicitante', 'numero_imovel', 'sem_numero_imovel',
  'complemento_ocorrencia', 'ponto_referencia', 'latitude_ocorrencia', 'longitude_ocorrencia',
  'fora_area_cobertura',
];
const PERMISSOES = {
  [DADOS]: {
    insert: [
      'solicitacao_id', 'nome_solicitante', 'cpf_solicitante', 'tipo_solicitante',
      'nome_instituicao', 'nome_falecido', 'documento_falecido', ...CONTATO_LOCAL,
      'descricao_ocorrencia', 'data_hora_ocorrencia', 'informacoes_medicas',
      'ciencia_aviso_privacidade', 'versao_aviso_privacidade',
    ],
    update: [
      ...CONTATO_LOCAL, 'motivo_recusa_publico',
      'analise_iniciada_em', 'analise_iniciada_por',
      'cancelamento_solicitado_em', 'cancelamento_motivo', 'cancelamento_status',
      'cancelamento_decidido_por', 'cancelamento_decidido_em',
      'cancelamento_justificativa_decisao', 'cancelamento_mensagem_publica',
      'versao_dados', 'encerrado_operacional_em', 'atualizado_em',
    ],
  },
  [CREDENCIAIS]: {
    insert: [
      'solicitacao_id', 'segredo_digest', 'algoritmo_digest', 'versao_credencial',
      'chave_idempotencia_criacao', 'payload_criacao_digest', 'prova_tentativa_digest',
    ],
    update: ['revogada_em', 'revogada_motivo', 'ultimo_acesso_em', 'atualizado_em'],
  },
  [RECUPERACOES]: {
    insert: ['solicitacao_id', 'envelope_cifrado', 'versao_chave', 'criado_em', 'expira_em'],
    update: ['descartada_em'],
  },
};

async function validarRoleAplicacao(knex, appUser, schema) {
  const { rows: [role] } = await knex.raw(`
    SELECT rolcanlogin, rolname = current_user AS executora,
           rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS admin,
           EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS membro,
           has_schema_privilege(r.oid, ?, 'CREATE') AS cria_no_schema
      FROM pg_roles r
     WHERE rolname = ?
  `, [schema, appUser]);
  if (!role || !role.rolcanlogin || role.executora || role.admin || role.membro || role.cria_no_schema) {
    throw new Error('solicitacoes externas svo: POSTGRES_APP_USER deve ser uma role de login separada, sem poderes administrativos, memberships ou CREATE no schema.');
  }
}

async function aplicarPrivilegiosSolicitacoesExternasSvo(knex, schema, appUser, corrigida = true, esquemaAtual) {
  const catalogo = knex.schema.withSchema(schema);
  const acompanhamento = esquemaAtual ?? await catalogo.hasColumn(DADOS, 'analise_iniciada_em');
  if (appUser) await validarRoleAplicacao(knex, appUser, schema);
  const { rows: [server] } = await knex.raw("SELECT current_setting('server_version_num')::int AS versao");
  const manutencao = server.versao >= 170000 ? ', MAINTAIN' : '';

  for (const [tabela, operacoes] of Object.entries(PERMISSOES)) {
    if (!acompanhamento && tabela === RECUPERACOES) continue;
    const { rows: colunas } = await knex.raw(`
      SELECT a.attname AS nome, c.oid AS tabela_oid, a.attnum AS numero
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = ? AND c.relname = ? AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum
    `, [schema, tabela]);
    if (!colunas.length) {
      throw new Error(`solicitacoes externas svo: tabela protegida ausente: ${tabela}.`);
    }

    const nomes = colunas.map(({ nome }) => nome);
    const permissoes = corrigida
      ? {
          insert: operacoes.insert,
          update: operacoes.update.filter((col) => acompanhamento || !['analise_iniciada_em', 'analise_iniciada_por', 'cancelamento_mensagem_publica'].includes(col)),
        }
      : { insert: [], update: [] };
    const ausentes = [...permissoes.insert, ...permissoes.update].filter((col) => !nomes.includes(col));
    if (ausentes.length) throw new Error(`solicitacoes externas svo: colunas obrigatórias ausentes em ${tabela}: ${ausentes.join(', ')}`);
    const listaColunas = nomes.map(() => '??').join(', ');
    const destinatarios = appUser ? 'PUBLIC, ??' : 'PUBLIC';
    const bindingsRole = appUser ? [appUser] : [];
    await knex.raw(`REVOKE ALL PRIVILEGES ON TABLE ??.?? FROM ${destinatarios}`,
      [schema, tabela, ...bindingsRole]);
    await knex.raw(`REVOKE ALL PRIVILEGES (${listaColunas}) ON TABLE ??.?? FROM ${destinatarios}`,
      [...nomes, schema, tabela, ...bindingsRole]);

    if (appUser) {
      await knex.raw('GRANT SELECT ON TABLE ??.?? TO ??', [schema, tabela, appUser]);
      for (const [operacao, permitidas] of Object.entries(permissoes)) {
        if (!permitidas.length) continue;
        const lista = permitidas.map(() => '??').join(', ');
        await knex.raw(`GRANT ${operacao} (${lista}) ON TABLE ??.?? TO ??`,
          [...permitidas, schema, tabela, appUser]);
      }
    }

    // Verifica acesso efetivo, inclusive concessões anteriores, default ACL e PUBLIC.
    const tabelaOid = colunas[0].tabela_oid;
    const { rows: [acl] } = await knex.raw(`
      SELECT EXISTS (
        SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
         WHERE c.oid = ?::oid AND a.grantee <> c.relowner
           AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = ?)
        UNION ALL
        SELECT FROM pg_class c JOIN pg_attribute col ON col.attrelid = c.oid
          CROSS JOIN LATERAL aclexplode(col.attacl) a
         WHERE c.oid = ?::oid AND col.attnum > 0 AND NOT col.attisdropped AND a.grantee <> c.relowner
           AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = ?)
      ) AS role_inesperada
    `, [tabelaOid, appUser || null, tabelaOid, appUser || null]);
    if (acl.role_inesperada) {
      throw new Error(`solicitacoes externas svo: existe uma concessão direta não prevista em ${tabela}; revise a ACL com o DBA.`);
    }
    const roles = appUser ? ['public', appUser] : ['public'];
    for (const role of roles) {
      const aplicacao = role === appUser;
      const { rows: [efetivo] } = await knex.raw(`
        SELECT has_table_privilege(?, ?::oid, 'SELECT') AS leitura,
               has_table_privilege(?, ?::oid,
                 'SELECT WITH GRANT OPTION, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER${manutencao}') AS excessivo
      `, [role, tabelaOid, role, tabelaOid]);
      const { rows: efetivas } = await knex.raw(`
        SELECT attname AS nome,
               has_column_privilege(?, attrelid, attnum, 'INSERT') AS insert,
               has_column_privilege(?, attrelid, attnum, 'UPDATE') AS update,
               has_column_privilege(?, attrelid, attnum, 'REFERENCES, SELECT WITH GRANT OPTION,
                  INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION') AS excessivo,
               has_column_privilege(?, attrelid, attnum, 'SELECT') AS leitura
          FROM pg_attribute
         WHERE attrelid = ?::oid AND attnum > 0 AND NOT attisdropped
      `, [role, role, role, role, tabelaOid]);
      if (efetivo.leitura !== aplicacao || efetivo.excessivo || efetivas.some((coluna) =>
        coluna.excessivo || coluna.leitura !== aplicacao ||
        coluna.insert !== (aplicacao && permissoes.insert.includes(coluna.nome)) ||
        coluna.update !== (aplicacao && permissoes.update.includes(coluna.nome)))) {
        throw new Error(`solicitacoes externas svo: privilégios efetivos incompatíveis em ${tabela}.`);
      }
    }
  }
}

module.exports = { aplicarPrivilegiosSolicitacoesExternasSvo, DADOS, CREDENCIAIS, RECUPERACOES };
