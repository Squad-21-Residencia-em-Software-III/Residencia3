exports.seed = async function(knex) {
  if (process.env.NODE_ENV === 'production') return;

  await knex.raw('TRUNCATE TABLE fornecedores, equipes_svo RESTART IDENTITY CASCADE');

  const usuarios = await knex('usuarios').select('id', 'email');
  const veiculos = await knex('veiculos').select('id', 'placa');
  const motoristas = await knex('motoristas').select('id', 'numero_cnh');

  const idUser = (email) => usuarios.find(u => u.email === email)?.id;
  const idVeic = (placa) => veiculos.find(v => v.placa === placa)?.id;
  const idMot = (cnh) => motoristas.find(m => m.numero_cnh === cnh)?.id;

  const fornecedores = await knex('fornecedores').insert([
    { nome: 'Posto PetroBrasil', cnpj: '11111111000111', tipo_servico: 'Posto de Combustível', contrato: 'CT-2026-01' },
    { nome: 'Oficina Roda Presa', cnpj: '22222222000122', tipo_servico: 'Local de Manutenção', contrato: 'CT-2026-02' }
  ]).returning('id');

  const equipes = await knex('equipes_svo').insert([
    { nome_equipe: 'Equipe Plantão SVO - A' },
    { nome_equipe: 'Equipe Plantão SVO - B' }
  ]).returning('id');

  await knex('auditorias').insert([
    { usuario_id: idUser('admin@exemplo.com'), acao: 'Criação de nova equipe SVO no sistema', modulo: 'Equipes', data_hora: new Date() }
  ]);

  await knex('documentos_veiculo').insert([
    { veiculo_id: idVeic('ABC1D23'), tipo: 'CRLV Frota 2026', data_vencimento: '2026-12-31' },
    { veiculo_id: idVeic('DEF2E34'), tipo: 'CRLV Frota 2026', data_vencimento: '2026-12-31' },
    { veiculo_id: idVeic('GHI3F45'), tipo: 'CRLV Frota 2026', data_vencimento: '2026-12-31' },
    { veiculo_id: idVeic('JKL4G56'), tipo: 'CRLV SVO 2026', data_vencimento: '2026-12-31' },
    { veiculo_id: idVeic('MNO5H67'), tipo: 'CRLV SVO 2026', data_vencimento: '2026-12-31' }
  ]);

  const solViagem = await knex('solicitacoes_viagem').insert([
    { solicitante_id: idUser('solicitante@exemplo.com'), origem: 'Sede Aracaju', destino: 'Filial Estância', finalidade: 'Reunião', data_saida_desejada: new Date('2026-10-30T08:00:00Z'), status: 'APROVADA' }
  ]).returning('id');

  const solSvo = await knex('solicitacoes_svo').insert([
    { registrante_id: idUser('gestor.svo@exemplo.com'), dados_solicitante: 'Hospital de Urgência', local_ocorrencia: 'Av. Tancredo Neves', material_sensivel: true, status: 'EM_ANDAMENTO' }
  ]).returning('id');

  await knex('escalas_svo').insert([
    { equipe_id: equipes[0].id, data_inicio: new Date('2026-10-01T06:00:00Z'), data_fim: new Date('2026-10-01T18:00:00Z') },
    { equipe_id: equipes[1].id, data_inicio: new Date('2026-10-01T18:00:00Z'), data_fim: new Date('2026-10-02T06:00:00Z') }
  ]);

  await knex('viagens_frota').insert([
    { solicitacao_id: solViagem[0].id, veiculo_id: idVeic('ABC1D23'), motorista_id: idMot('10000000001'), status: 'AGENDADA' }
  ]);

  await knex('ordens_svo').insert([
    { solicitacao_id: solSvo[0].id, veiculo_id: idVeic('JKL4G56'), motorista_id: idMot('10000000002'), equipe_id: equipes[0].id, status: 'ALOCADA' }
  ]);

  await knex('manutencoes').insert([
    { veiculo_id: idVeic('GHI3F45'), fornecedor_id: fornecedores[1].id, tipo_manutencao: 'CORRETIVA', data_manutencao: '2026-10-20', descricao: 'Troca de pastilhas', custo: 850.00, status: 'CONCLUIDA' }
  ]);

  await knex('abastecimentos').insert([
    { veiculo_id: idVeic('ABC1D23'), motorista_id: idMot('10000000001'), fornecedor_id: fornecedores[0].id, data_abastecimento: '2026-10-22', quilometragem: 45200, litros: 40.5, valor_total: 242.60, posto_combustivel: 'Posto PetroBrasil' }
  ]);
};