/**
 * Schema inicial — Modelo de Dados de Gestão de Frotas.
 * As tabelas são criadas na ordem das dependências de FK; o down remove na ordem inversa.
 */

/** @param {import('knex').Knex} knex */
exports.up = (knex) =>
  knex.schema
    .createTable('fornecedores', (table) => {
      table.increments('id');
      table.string('nome', 255).notNullable();
      table.string('cnpj', 20).notNullable().unique();
      table.string('tipo_servico', 100);
      table.string('contrato', 100);
    })
    .createTable('usuarios', (table) => {
      table.increments('id');
      table.string('nome', 255).notNullable();
      table.string('email', 255).notNullable().unique();
      table.string('senha', 255).notNullable();
      table.string('tipo_usuario', 50).notNullable();
      table.string('perfil', 50).notNullable();
      table.boolean('ativo').defaultTo(true);
    })
    .createTable('veiculos', (table) => {
      table.increments('id');
      table.string('placa', 10).notNullable().unique();
      table.string('modelo', 100).notNullable();
      table.string('tipo_frota', 20).notNullable();
      table.integer('capacidade_maxima').notNullable();
      table.string('status', 30).defaultTo('DISPONIVEL');
    })
    .createTable('equipes_svo', (table) => {
      table.increments('id');
      table.string('nome_equipe', 100).notNullable();
    })
    .createTable('auditorias', (table) => {
      table.increments('id');
      table.integer('usuario_id').references('id').inTable('usuarios').onDelete('RESTRICT').index();
      table.string('acao', 255).notNullable();
      table.string('modulo', 100).notNullable();
      table.timestamp('data_hora', { useTz: false }).defaultTo(knex.fn.now());
    })
    .createTable('motoristas', (table) => {
      table.increments('id');
      table.integer('usuario_id').references('id').inTable('usuarios').onDelete('RESTRICT').index();
      table.string('numero_cnh', 20).notNullable().unique();
      table.string('categoria_cnh', 5).notNullable();
      table.date('validade_cnh').notNullable();
      table.string('tipo_motorista', 20).notNullable();
      table.string('status', 30).defaultTo('DISPONIVEL');
    })
    .createTable('manutencoes', (table) => {
      table.increments('id');
      table.integer('veiculo_id').references('id').inTable('veiculos').onDelete('RESTRICT').index();
      table.integer('fornecedor_id').references('id').inTable('fornecedores').onDelete('RESTRICT').index();
      table.string('tipo_manutencao', 50).notNullable();
      table.date('data_manutencao').notNullable();
      table.text('descricao').notNullable();
      table.decimal('custo', 10, 2).notNullable();
      table.string('status', 30).defaultTo('AGENDADA');
    })
    .createTable('documentos_veiculo', (table) => {
      table.increments('id');
      table.integer('veiculo_id').references('id').inTable('veiculos').onDelete('RESTRICT').index();
      table.string('tipo', 100).notNullable();
      table.date('data_vencimento').notNullable();
    })
    .createTable('solicitacoes_viagem', (table) => {
      table.increments('id');
      table.integer('solicitante_id').references('id').inTable('usuarios').onDelete('RESTRICT').index();
      table.string('origem', 255).notNullable();
      table.string('destino', 255).notNullable();
      table.text('finalidade').notNullable();
      table.timestamp('data_saida_desejada', { useTz: false }).notNullable();
      table.timestamp('data_chegada_desejada', { useTz: false });
      table.string('status', 30).defaultTo('PENDENTE_APROVACAO');
    })
    .createTable('solicitacoes_svo', (table) => {
      table.increments('id');
      table.integer('registrante_id').references('id').inTable('usuarios').onDelete('RESTRICT').index();
      table.text('dados_solicitante').notNullable();
      table.string('local_ocorrencia', 255).notNullable();
      table.boolean('material_sensivel').defaultTo(false);
      table.string('status', 30).defaultTo('EM_TRIAGEM');
    })
    .createTable('escalas_svo', (table) => {
      table.increments('id');
      table.integer('equipe_id').references('id').inTable('equipes_svo').onDelete('RESTRICT').index();
      table.timestamp('data_inicio', { useTz: false }).notNullable();
      table.timestamp('data_fim', { useTz: false }).notNullable();
    })
    .createTable('multas', (table) => {
      table.increments('id');
      table.integer('veiculo_id').references('id').inTable('veiculos').onDelete('RESTRICT').index();
      table.integer('motorista_id').references('id').inTable('motoristas').onDelete('RESTRICT').index();
      table.date('data_infracao').notNullable();
      table.decimal('valor', 10, 2).notNullable();
      table.text('descricao');
      table.integer('pontos').notNullable();
    })
    .createTable('abastecimentos', (table) => {
      table.increments('id');
      table.integer('veiculo_id').references('id').inTable('veiculos').onDelete('RESTRICT').index();
      table.integer('motorista_id').references('id').inTable('motoristas').onDelete('RESTRICT').index();
      table.integer('fornecedor_id').references('id').inTable('fornecedores').onDelete('RESTRICT').index();
      table.date('data_abastecimento').notNullable();
      table.integer('quilometragem').notNullable();
      table.decimal('litros', 10, 2).notNullable();
      table.decimal('valor_total', 10, 2).notNullable();
      table.string('posto_combustivel', 150);
    })
    .createTable('viagens_frota', (table) => {
      table.increments('id');
      table.integer('solicitacao_id').references('id').inTable('solicitacoes_viagem').onDelete('RESTRICT').index();
      table.integer('veiculo_id').references('id').inTable('veiculos').onDelete('RESTRICT').index();
      table.integer('motorista_id').references('id').inTable('motoristas').onDelete('RESTRICT').index();
      table.integer('km_inicial');
      table.integer('km_final');
      table.timestamp('data_hora_efetiva_saida', { useTz: false });
      table.timestamp('data_hora_efetiva_chegada', { useTz: false });
      table.string('status', 30).defaultTo('AGENDADA');
    })
    .createTable('ordens_svo', (table) => {
      table.increments('id');
      table.integer('solicitacao_id').references('id').inTable('solicitacoes_svo').onDelete('RESTRICT').index();
      table.integer('veiculo_id').references('id').inTable('veiculos').onDelete('RESTRICT').index();
      table.integer('motorista_id').references('id').inTable('motoristas').onDelete('RESTRICT').index();
      table.integer('equipe_id').references('id').inTable('equipes_svo').onDelete('RESTRICT').index();
      table.integer('capacidade_utilizada').defaultTo(1);
      table.timestamp('data_hora_chamado', { useTz: false }).defaultTo(knex.fn.now());
      table.timestamp('data_hora_conclusao', { useTz: false });
      table.integer('km_inicial');
      table.integer('km_final');
      table.string('status', 30).defaultTo('ALOCADA');
    });

/** @param {import('knex').Knex} knex */
exports.down = (knex) =>
  knex.schema
    .dropTable('ordens_svo')
    .dropTable('viagens_frota')
    .dropTable('abastecimentos')
    .dropTable('multas')
    .dropTable('escalas_svo')
    .dropTable('solicitacoes_svo')
    .dropTable('solicitacoes_viagem')
    .dropTable('documentos_veiculo')
    .dropTable('manutencoes')
    .dropTable('motoristas')
    .dropTable('auditorias')
    .dropTable('equipes_svo')
    .dropTable('veiculos')
    .dropTable('usuarios')
    .dropTable('fornecedores');
