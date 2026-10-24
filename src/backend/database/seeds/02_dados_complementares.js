/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  if (process.env.NODE_ENV === 'production') return;

  // 1. Limpar as tabelas extras para evitar duplicação (o CASCADE limpa as dependentes)
  await knex.raw('TRUNCATE TABLE fornecedores, equipes_svo RESTART IDENTITY CASCADE');

  // 2. Capturar os registros criados pelo arquivo 01_dados_iniciais.js
  const usuarios = await knex('usuarios').select('id', 'email');
  const veiculos = await knex('veiculos').select('id', 'placa');
  const motoristas = await knex('motoristas').select('id', 'numero_cnh');

  const idUser = (email) => usuarios.find(u => u.email === email)?.id;
  const idVeic = (placa) => veiculos.find(v => v.placa === placa)?.id;
  const idMot = (cnh) => motoristas.find(m => m.numero_cnh === cnh)?.id;

  // 3. fornecedores (Posto de Gasolina e Oficina)
  const fornecedores = await knex('fornecedores').insert([
    { nome: 'Posto PetroBrasil', cnpj: '11111111000111', tipo_servico: 'Combustível', contrato: 'CT-2026-01' },
    { nome: 'Oficina Roda Presa', cnpj: '22222222000122', tipo_servico: 'Manutenção Automotiva', contrato: 'CT-2026-02' }
  ]).returning('id');

  // 4. equipes_svo
  const equipes = await knex('equipes_svo').insert([
    { nome_equipe: 'Equipe Alfa (Diurna)' },
    { nome_equipe: 'Equipe Beta (Noturna)' }
  ]).returning('id');

  // 5. auditorias
  await knex('auditorias').insert([
    { usuario_id: idUser('admin@exemplo.com'), acao: 'Acesso inicial ao sistema', modulo: 'Auth' }
  ]);

  // 6. documentos_veiculo
  await knex('documentos_veiculo').insert([
    { veiculo_id: idVeic('ABC1D23'), tipo: 'CRLV 2026', data_vencimento: '2026-12-31' },
    { veiculo_id: idVeic('JKL4G56'), tipo: 'Seguro Frota Total', data_vencimento: '2027-05-10' }
  ]);

  // 7. solicitacoes_viagem
  const solViagem = await knex('solicitacoes_viagem').insert([
    {
      solicitante_id: idUser('solicitante@exemplo.com'),
      origem: 'Sede Aracaju',
      destino: 'Filial Estância',
      finalidade: 'Reunião de alinhamento estratégico',
      data_saida_desejada: new Date('2026-10-30T08:00:00Z'),
      status: 'APROVADA'
    }
  ]).returning('id');

  // 8. solicitacoes_svo
  const solSvo = await knex('solicitacoes_svo').insert([
    {
      registrante_id: idUser('gestor.svo@exemplo.com'),
      dados_solicitante: 'Hospital de Urgência (João Marcos)',
      local_ocorrencia: 'Av. Tancredo Neves, S/N',
      material_sensivel: true,
      status: 'EM_ANDAMENTO'
    }
  ]).returning('id');

  // 9. escalas_svo
  await knex('escalas_svo').insert([
    { equipe_id: equipes[0].id, data_inicio: new Date('2026-10-25T06:00:00Z'), data_fim: new Date('2026-10-25T18:00:00Z') }
  ]);

  // 10. viagens_frota
  await knex('viagens_frota').insert([
    {
      solicitacao_id: solViagem[0].id,
      veiculo_id: idVeic('ABC1D23'),
      motorista_id: idMot('10000000001'),
      status: 'AGENDADA'
    }
  ]);

  // 11. ordens_svo
  await knex('ordens_svo').insert([
    {
      solicitacao_id: solSvo[0].id,
      veiculo_id: idVeic('JKL4G56'),
      motorista_id: idMot('10000000002'),
      equipe_id: equipes[0].id,
      status: 'ALOCADA'
    }
  ]);

  // 12. manutencoes (Utilizando a Oficina)
  await knex('manutencoes').insert([
    {
      veiculo_id: idVeic('GHI3F45'),
      fornecedor_id: fornecedores[1].id,
      tipo_manutencao: 'Corretiva',
      data_manutencao: '2026-10-20',
      descricao: 'Troca de pastilhas de freio e alinhamento.',
      custo: 850.00,
      status: 'CONCLUIDA'
    }
  ]);

  // 13. abastecimentos (Utilizando o Posto)
  await knex('abastecimentos').insert([
    {
      veiculo_id: idVeic('ABC1D23'),
      motorista_id: idMot('10000000001'),
      fornecedor_id: fornecedores[0].id,
      data_abastecimento: '2026-10-22',
      quilometragem: 45200,
      litros: 40.5,
      valor_total: 242.60,
      posto_combustivel: 'Posto PetroBrasil'
    }
  ]);

  console.log('Seed complementar concluído: 15 tabelas populadas na Neon.');
};