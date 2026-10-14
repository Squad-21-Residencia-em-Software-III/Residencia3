/**
 * Seed inicial: dados FICTÍCIOS para desenvolvimento.
 * ATENÇÃO: apaga os dados das tabelas listadas (e das que dependem delas)
 * e recria tudo. Nunca rodar em produção.
 *
 * Senha de TODOS os usuários de teste: Senha@123
 */
exports.seed = async function (knex) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed bloqueado: não rode em produção.');
  }

  const SENHA_TESTE = 'Senha@123';

  await knex.transaction(async (trx) => {
    // O hash é gerado pelo próprio PostgreSQL (bcrypt), sem instalar nada no Node.
    await trx.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    const hash = () => trx.raw("crypt(?, gen_salt('bf', 10))", [SENHA_TESTE]);

    // 1) Limpar. O CASCADE também limpa as tabelas que dependem destas
    //    (viagens, abastecimentos, etc.). Isso é intencional, só em dev.
    await trx.raw(
      'TRUNCATE TABLE motoristas, veiculos, usuarios RESTART IDENTITY CASCADE'
    );

    // 2) Usuários (um de cada perfil + um motorista com CNH vencida)
    const usuarios = await trx('usuarios')
      .insert([
        { nome: 'Carlos Silva',      email: 'admin@exemplo.com',            senha: hash(), tipo_usuario: 'ADMINISTRADOR', perfil: 'ADMINISTRADOR',   ativo: true },
        { nome: 'Mariana Souza',     email: 'solicitante@exemplo.com',      senha: hash(), tipo_usuario: 'SOLICITANTE',   perfil: 'SOLICITANTE',     ativo: true },
        { nome: 'Roberto Mendes',    email: 'gestor.frota@exemplo.com',     senha: hash(), tipo_usuario: 'GESTOR_FROTA',  perfil: 'GESTOR_FROTA',    ativo: true },
        { nome: 'Ana Paula Lima',    email: 'gestor.svo@exemplo.com',       senha: hash(), tipo_usuario: 'GESTOR_SVO',    perfil: 'GESTOR_SVO',      ativo: true },
        { nome: 'João Santos',       email: 'motorista.frota@exemplo.com',  senha: hash(), tipo_usuario: 'MOTORISTA',     perfil: 'MOTORISTA_FROTA', ativo: true },
        { nome: 'Marcos Oliveira',   email: 'motorista.svo@exemplo.com',    senha: hash(), tipo_usuario: 'MOTORISTA',     perfil: 'MOTORISTA_SVO',   ativo: true },
        { nome: 'Pedro Vencido',     email: 'motorista.vencido@exemplo.com',senha: hash(), tipo_usuario: 'MOTORISTA',     perfil: 'MOTORISTA_FROTA', ativo: true },
      ])
      .returning(['id', 'email']);

    const idUsuario = Object.fromEntries(usuarios.map((u) => [u.email, u.id]));

    // 3) Veículos (frota administrativa e frota SVO)
    await trx('veiculos').insert([
      { placa: 'ABC1D23', modelo: 'Fiat Mobi',         tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4,  status: 'DISPONIVEL' },
      { placa: 'DEF2E34', modelo: 'Chevrolet Onix',    tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4,  status: 'DISPONIVEL' },
      { placa: 'GHI3F45', modelo: 'Renault Master',    tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 12, status: 'MANUTENCAO' },
      { placa: 'JKL4G56', modelo: 'Fiat Ducato (SVO)',   tipo_frota: 'SVO',            capacidade_maxima: 2,  status: 'DISPONIVEL' },
      { placa: 'MNO5H67', modelo: 'Renault Master (SVO)', tipo_frota: 'SVO',          capacidade_maxima: 2,  status: 'DISPONIVEL' },
    ]);

    // 4) Motoristas (ligados aos usuários acima)
    await trx('motoristas').insert([
      { usuario_id: idUsuario['motorista.frota@exemplo.com'],   numero_cnh: '10000000001', categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA' },
      { usuario_id: idUsuario['motorista.svo@exemplo.com'],     numero_cnh: '10000000002', categoria_cnh: 'D', validade_cnh: '2030-06-30', tipo_motorista: 'SVO' },
      { usuario_id: idUsuario['motorista.vencido@exemplo.com'], numero_cnh: '10000000003', categoria_cnh: 'B', validade_cnh: '2024-01-15', tipo_motorista: 'FROTA' }, // vencida de propósito
    ]);

    console.log('Seed concluído: 7 usuários, 5 veículos, 3 motoristas.');
  });
};