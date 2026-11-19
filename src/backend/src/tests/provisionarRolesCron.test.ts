import { describe, expect, it, vi } from 'vitest';

const { provisionarRolesCron } = require('../../scripts/provisionar-roles-cron.cjs') as {
  provisionarRolesCron: (opcoes: {
    env: NodeJS.ProcessEnv;
    criarConexao: ReturnType<typeof simularBanco>['criarConexao'];
  }) => Promise<void>;
};

const envCron = {
  POSTGRES_DB: 'frotas_teste',
  FSPH_CRON_EXPIRACAO_USER: 'cron_exp_teste',
  FSPH_CRON_EXPIRACAO_PASSWORD: 'senha-exp-teste',
  FSPH_CRON_RETENCAO_USER: 'cron_ret_teste',
  FSPH_CRON_RETENCAO_PASSWORD: 'senha-ret-teste',
};
const expUser = envCron.FSPH_CRON_EXPIRACAO_USER;
const retUser = envCron.FSPH_CRON_RETENCAO_USER;

function simularBanco({
  rolesExistentes = [] as string[],
  rolsuper = false,
  memberships = [] as Array<{ role_herdada: string }>,
} = {}) {
  const consultarRole = vi.fn(({ rolname }: { rolname: string }) => ({
    first: async () => ({ rolname, rolcanlogin: true }),
  }));
  const raw = vi.fn(async (sql: string, valores: string[] = []) => {
    if (sql.endsWith('WHERE rolname = current_user')) {
      return { rows: [{ rolname: 'executor_teste', rolsuper, usuario_sessao: 'sessao_teste' }] };
    }
    if (sql.startsWith('SELECT format(')) {
      const [nome, senha] = valores;
      const comando = sql.split("'")[1].replace('%I', nome).replace('%L', `'${senha}'`);
      return { rows: [{ cmd: comando }] };
    }
    if (sql.includes('FROM pg_auth_members')) {
      return { rows: memberships };
    }
    if (sql.includes('has_schema_privilege')) {
      return { rows: [{ pode_usar_public: true }] };
    }
    if (sql.includes('information_schema.role_table_grants') || /^(CREATE|ALTER|REVOKE|GRANT) /.test(sql)) {
      return { rows: [] };
    }
    throw new Error(`SQL inesperado no teste: ${sql}`);
  });
  const trx = Object.assign(
    () => ({
      where: consultarRole,
      whereIn: (_coluna: string, nomes: string[]) => ({
        select: async () =>
          nomes.filter((nome) => rolesExistentes.includes(nome)).map((rolname) => ({ rolname })),
      }),
    }),
    { raw }
  );
  const destroy = vi.fn(async () => {});
  const criarConexao = vi.fn(() => ({
    transaction: async (executar: (conexao: typeof trx) => Promise<void>) => executar(trx),
    destroy,
  }));

  return { criarConexao, raw, consultarRole, destroy };
}

describe('Provisionamento das roles de cron', () => {
  it('rejeita nomes duplicados antes de conectar', async () => {
    const { criarConexao } = simularBanco();
    const env = { ...envCron, FSPH_CRON_RETENCAO_USER: expUser };

    await expect(provisionarRolesCron({ env, criarConexao })).rejects.toThrow(/devem ser distintos/);
    expect(criarConexao).not.toHaveBeenCalled();
  });

  it.each(['POSTGRES_APP_USER', 'POSTGRES_MIGRATION_USER', 'POSTGRES_USER'])(
    'rejeita a role configurada em %s antes de conectar',
    async (variavel) => {
      const { criarConexao } = simularBanco();
      const env = { ...envCron, [variavel]: retUser };

      await expect(provisionarRolesCron({ env, criarConexao })).rejects.toThrow(/role reservado/);
      expect(criarConexao).not.toHaveBeenCalled();
    }
  );

  it.each(['frotas_app', 'postgres', 'public', 'pg_read_all_data'])('protege o nome reservado %s', async (nome) => {
    const { criarConexao } = simularBanco();
    const env = { ...envCron, FSPH_CRON_EXPIRACAO_USER: nome };

    await expect(provisionarRolesCron({ env, criarConexao })).rejects.toThrow(/role reservado/);
    expect(criarConexao).not.toHaveBeenCalled();
  });

  it.each(['executor_teste', 'sessao_teste'])(
    'rejeita o nome do executor %s antes de modificar qualquer role',
    async (nome) => {
      const { criarConexao, raw, destroy } = simularBanco();
      const env = { ...envCron, FSPH_CRON_RETENCAO_USER: nome };

      await expect(provisionarRolesCron({ env, criarConexao })).rejects.toThrow(/role reservado para o usuario executor/);
      expect(raw.mock.calls).toEqual([[expect.stringContaining('rolname = current_user')]]);
      expect(destroy).toHaveBeenCalledOnce();
    }
  );

  it('rejeita nomes que poderiam ser truncados pelo PostgreSQL', async () => {
    const { criarConexao } = simularBanco();
    const env = { ...envCron, FSPH_CRON_RETENCAO_USER: 'a'.repeat(64) };

    await expect(provisionarRolesCron({ env, criarConexao })).rejects.toThrow(/63 caracteres/);
    expect(criarConexao).not.toHaveBeenCalled();
  });

  it.each([undefined, 'false', '1'])('preserva as senhas existentes com a opção %s', async (opcao) => {
    const { criarConexao, raw, consultarRole } = simularBanco({ rolesExistentes: [expUser, retUser] });
    const env = { ...envCron, FSPH_CRON_ROTACIONAR_SENHAS: opcao };

    await provisionarRolesCron({ env, criarConexao });

    expect(raw.mock.calls.filter(([sql]) => sql.includes('PASSWORD'))).toEqual([]);
    const alterRole = 'ALTER ROLE ?? WITH LOGIN NOCREATEDB NOCREATEROLE NOINHERIT';
    expect(raw).toHaveBeenCalledWith(alterRole, [expUser]);
    expect(raw).toHaveBeenCalledWith(alterRole, [retUser]);
    expect(consultarRole.mock.calls).toEqual([[{ rolname: expUser }], [{ rolname: retUser }]]);
  });

  it('permite provisionar role existente sem senha e exige senha apenas para a role nova', async () => {
    const { criarConexao, raw } = simularBanco({ rolesExistentes: [expUser], rolsuper: true });
    const env = { ...envCron, FSPH_CRON_EXPIRACAO_PASSWORD: undefined };

    await provisionarRolesCron({ env, criarConexao });

    expect(raw).toHaveBeenCalledWith(
      'ALTER ROLE ?? WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
      [expUser]
    );
    expect(raw).toHaveBeenCalledWith(
      expect.stringContaining(`CREATE ROLE ${retUser} WITH LOGIN PASSWORD '${env.FSPH_CRON_RETENCAO_PASSWORD}'`)
    );
  });

  it('rotaciona as senhas existentes quando solicitado explicitamente', async () => {
    const { criarConexao, raw } = simularBanco({ rolesExistentes: [expUser, retUser] });
    const env = { ...envCron, FSPH_CRON_ROTACIONAR_SENHAS: 'true' };

    await provisionarRolesCron({ env, criarConexao });

    expect(raw.mock.calls.map(([sql]) => sql).filter((sql) => sql.startsWith('ALTER ROLE '))).toEqual([
      `ALTER ROLE ${expUser} WITH LOGIN PASSWORD '${env.FSPH_CRON_EXPIRACAO_PASSWORD}' NOCREATEDB NOCREATEROLE NOINHERIT`,
      `ALTER ROLE ${retUser} WITH LOGIN PASSWORD '${env.FSPH_CRON_RETENCAO_PASSWORD}' NOCREATEDB NOCREATEROLE NOINHERIT`,
    ]);
  });

  it('valida todas as senhas necessárias antes de alterar qualquer role', async () => {
    const { criarConexao, raw } = simularBanco({ rolesExistentes: [expUser, retUser] });
    const env = {
      ...envCron,
      FSPH_CRON_ROTACIONAR_SENHAS: 'true',
      FSPH_CRON_RETENCAO_PASSWORD: undefined,
    };

    await expect(provisionarRolesCron({ env, criarConexao })).rejects.toThrow(/FSPH_CRON_RETENCAO_PASSWORD/);
    expect(raw.mock.calls).toEqual([[expect.stringContaining('rolname = current_user')]]);
  });

  it('cria duas roles válidas com senha e concede os privilégios previstos para cada job', async () => {
    const { criarConexao, raw, consultarRole, destroy } = simularBanco();

    await provisionarRolesCron({ env: envCron, criarConexao });

    expect(raw.mock.calls.map(([sql]) => sql).filter((sql) => sql.startsWith('CREATE ROLE '))).toEqual([
      expect.stringContaining(`CREATE ROLE ${expUser} WITH LOGIN PASSWORD '${envCron.FSPH_CRON_EXPIRACAO_PASSWORD}'`),
      expect.stringContaining(`CREATE ROLE ${retUser} WITH LOGIN PASSWORD '${envCron.FSPH_CRON_RETENCAO_PASSWORD}'`),
    ]);
    expect(raw).toHaveBeenCalledWith(
      'GRANT SELECT (id, status, data_saida_desejada), UPDATE (status) ON TABLE public.solicitacoes_viagem TO ??',
      [expUser]
    );
    expect(raw).toHaveBeenCalledWith(
      'GRANT SELECT (evidencia_id), DELETE ON TABLE public.evidencias_odometro_arquivos TO ??',
      [retUser]
    );
    expect(consultarRole.mock.calls).toEqual([[{ rolname: expUser }], [{ rolname: retUser }]]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('rejeita o provisionamento se a validação detectar privilégios excessivos', async () => {
    const { criarConexao, destroy } = simularBanco({ memberships: [{ role_herdada: 'role_indevida' }] });

    await expect(provisionarRolesCron({ env: envCron, criarConexao })).rejects.toThrow(/associacoes herdadas indevidas/);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
