exports.seed = async function (knex) {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed bloqueado em produção.');

  const SENHA_TESTE = 'Senha@123';

  await knex.transaction(async (trx) => {
    await trx.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    const hash = () => trx.raw("crypt(?, gen_salt('bf', 10))", [SENHA_TESTE]);

    await trx.raw('TRUNCATE TABLE motoristas, veiculos, usuarios RESTART IDENTITY CASCADE');

    const usuarios = await trx('usuarios').insert([
      { nome: 'Carlos Silva', email: 'admin@exemplo.com', senha: hash(), tipo_usuario: 'ADMINISTRADOR', perfil: 'ADMINISTRADOR', ativo: true },
      { nome: 'Mariana Souza', email: 'solicitante@exemplo.com', senha: hash(), tipo_usuario: 'SOLICITANTE', perfil: 'SOLICITANTE', ativo: true },
      { nome: 'Roberto Mendes', email: 'gestor.frota@exemplo.com', senha: hash(), tipo_usuario: 'GESTOR_FROTA', perfil: 'GESTOR_FROTA', ativo: true },
      { nome: 'Ana Paula Lima', email: 'gestor.svo@exemplo.com', senha: hash(), tipo_usuario: 'GESTOR_SVO', perfil: 'GESTOR_SVO', ativo: true },
      { nome: 'João Santos', email: 'motorista.frota@exemplo.com', senha: hash(), tipo_usuario: 'MOTORISTA', perfil: 'MOTORISTA_FROTA', ativo: true },
      { nome: 'Marcos Oliveira', email: 'motorista.svo@exemplo.com', senha: hash(), tipo_usuario: 'MOTORISTA', perfil: 'MOTORISTA_SVO', ativo: true }
    ]).returning(['id', 'email']);

    const idUser = Object.fromEntries(usuarios.map(u => [u.email, u.id]));

    const veiculos = await trx('veiculos').insert([
      { placa: 'ABC1D23', modelo: 'Fiat Mobi', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4, status: 'DISPONIVEL' },
      { placa: 'DEF2E34', modelo: 'Chevrolet Onix', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4, status: 'DISPONIVEL' },
      { placa: 'GHI3F45', modelo: 'Renault Master', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 12, status: 'MANUTENCAO' },
      { placa: 'JKL4G56', modelo: 'Fiat Ducato', tipo_frota: 'SVO', capacidade_maxima: 2, status: 'DISPONIVEL' },
      { placa: 'MNO5H67', modelo: 'Renault Master SVO', tipo_frota: 'SVO', capacidade_maxima: 2, status: 'DISPONIVEL' }
    ]).returning(['id', 'placa']);

    const idVeic = Object.fromEntries(veiculos.map(v => [v.placa, v.id]));

    const motoristas = await trx('motoristas').insert([
      { usuario_id: idUser['motorista.frota@exemplo.com'], numero_cnh: '10000000001', categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA' },
      { usuario_id: idUser['motorista.svo@exemplo.com'], numero_cnh: '10000000002', categoria_cnh: 'D', validade_cnh: '2030-06-30', tipo_motorista: 'SVO' }
    ]).returning(['id', 'numero_cnh']);

    const idMot = Object.fromEntries(motoristas.map(m => [m.numero_cnh, m.id]));

    await trx('multas').insert([
      { veiculo_id: idVeic['ABC1D23'], motorista_id: idMot['10000000001'], data_infracao: new Date('2026-10-15T14:30:00Z'), valor: 130.16, descricao: 'Excesso de velocidade', pontos: 4, status_pagamento: 'PENDENTE', data_vencimento: '2026-11-20', id_infracao: 'A123456789', orgao_autuador: 'SMTT' }
    ]);
  });
};