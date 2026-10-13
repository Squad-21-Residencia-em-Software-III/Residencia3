CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    tipo_usuario VARCHAR(50) NOT NULL,
    perfil VARCHAR(50) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE auditorias (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id),
    acao VARCHAR(255) NOT NULL,
    modulo VARCHAR(100) NOT NULL,
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE motoristas (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id),
    numero_cnh VARCHAR(20) UNIQUE NOT NULL,
    categoria_cnh VARCHAR(5) NOT NULL,
    validade_cnh DATE NOT NULL,
    tipo_motorista VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'DISPONIVEL'
);

CREATE TABLE fornecedores (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20) UNIQUE NOT NULL,
    tipo_servico VARCHAR(100),
    contrato VARCHAR(100)
);

CREATE TABLE veiculos (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(10) UNIQUE NOT NULL,
    modelo VARCHAR(100) NOT NULL,
    tipo_frota VARCHAR(20) NOT NULL,
    capacidade_maxima INT NOT NULL,
    status VARCHAR(30) DEFAULT 'DISPONIVEL'
);

CREATE TABLE documentos_veiculo (
    id SERIAL PRIMARY KEY,
    veiculo_id INT REFERENCES veiculos(id),
    tipo VARCHAR(100) NOT NULL,
    data_vencimento DATE NOT NULL
);

CREATE TABLE multas (
    id SERIAL PRIMARY KEY,
    veiculo_id INT REFERENCES veiculos(id),
    motorista_id INT REFERENCES motoristas(id),
    data_infracao DATE NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    descricao TEXT,
    pontos INT NOT NULL
);

CREATE TABLE abastecimentos (
    id SERIAL PRIMARY KEY,
    veiculo_id INT REFERENCES veiculos(id),
    motorista_id INT REFERENCES motoristas(id),
    fornecedor_id INT REFERENCES fornecedores(id),
    data_abastecimento DATE NOT NULL,
    quilometragem INT NOT NULL,
    litros DECIMAL(10,2) NOT NULL,
    valor_total DECIMAL(10,2) NOT NULL,
    posto_combustivel VARCHAR(150)
);

CREATE TABLE manutencoes (
    id SERIAL PRIMARY KEY,
    veiculo_id INT REFERENCES veiculos(id),
    fornecedor_id INT REFERENCES fornecedores(id),
    tipo_manutencao VARCHAR(50) NOT NULL,
    data_manutencao DATE NOT NULL,
    descricao TEXT NOT NULL,
    custo DECIMAL(10,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'AGENDADA'
);

CREATE TABLE solicitacoes_viagem (
    id SERIAL PRIMARY KEY,
    solicitante_id INT REFERENCES usuarios(id),
    origem VARCHAR(255) NOT NULL,
    destino VARCHAR(255) NOT NULL,
    finalidade TEXT NOT NULL,
    data_saida_desejada TIMESTAMP NOT NULL,
    data_chegada_desejada TIMESTAMP,
    status VARCHAR(30) DEFAULT 'PENDENTE_APROVACAO'
);

CREATE TABLE viagens_frota (
    id SERIAL PRIMARY KEY,
    solicitacao_id INT REFERENCES solicitacoes_viagem(id),
    veiculo_id INT REFERENCES veiculos(id),
    motorista_id INT REFERENCES motoristas(id),
    km_inicial INT,
    km_final INT,
    data_hora_efetiva_saida TIMESTAMP,
    data_hora_efetiva_chegada TIMESTAMP,
    status VARCHAR(30) DEFAULT 'AGENDADA'
);

CREATE TABLE solicitacoes_svo (
    id SERIAL PRIMARY KEY,
    registrante_id INT REFERENCES usuarios(id),
    dados_solicitante TEXT NOT NULL,
    local_ocorrencia VARCHAR(255) NOT NULL,
    material_sensivel BOOLEAN DEFAULT FALSE,
    status VARCHAR(30) DEFAULT 'EM_TRIAGEM'
);

CREATE TABLE equipes_svo (
    id SERIAL PRIMARY KEY,
    nome_equipe VARCHAR(100) NOT NULL
);

CREATE TABLE escalas_svo (
    id SERIAL PRIMARY KEY,
    equipe_id INT REFERENCES equipes_svo(id),
    data_inicio TIMESTAMP NOT NULL,
    data_fim TIMESTAMP NOT NULL
);

CREATE TABLE ordens_svo (
    id SERIAL PRIMARY KEY,
    solicitacao_id INT REFERENCES solicitacoes_svo(id),
    veiculo_id INT REFERENCES veiculos(id),
    motorista_id INT REFERENCES motoristas(id),
    equipe_id INT REFERENCES equipes_svo(id),
    capacidade_utilizada INT DEFAULT 1,
    data_hora_chamado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_hora_conclusao TIMESTAMP,
    km_inicial INT,
    km_final INT,
    status VARCHAR(30) DEFAULT 'ALOCADA'
);