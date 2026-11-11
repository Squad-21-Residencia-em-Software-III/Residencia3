import type { Knex } from 'knex';
import { db } from '../config/database';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { motoristaModel } from '../models/motoristaModel';
import { veiculoModel } from '../models/veiculoModel';
import { viagemModel, type ViagemDetalhada } from '../models/viagemModel';
import type { CriarViagemInput, TipoOperacao } from '../validators/viagemSchemas';
import {
  periodoDaSolicitacao,
  STATUS_MOTORISTA_BLOQUEADO,
  STATUS_VEICULO_BLOQUEADO,
  ultimoDiaDaSolicitacao,
  viagensConflitantes,
} from './disponibilidadeService';

interface Autor {
  id: number;
  perfil: Perfil;
}

type CriarViagemFrotaInput = Extract<CriarViagemInput, { tipo_operacao: 'ADMINISTRATIVA' }>;
type CriarOrdemSvoInput = Extract<CriarViagemInput, { tipo_operacao: 'SVO' }>;

// Tabela e status equivalentes de cada tipo de operação.
// solicitacao*: status que a solicitação recebe em cada etapa (null = não muda).
// solicitacoes_viagem só tem status de análise, então segue APROVADA durante a viagem
// e volta a poder ser agendada quando a viagem é cancelada.
const OPERACOES = {
  ADMINISTRATIVA: {
    tabela: 'viagens_frota',
    agendada: 'AGENDADA',
    emAndamento: 'EM_ANDAMENTO',
    colunaSaida: 'data_hora_efetiva_saida',
    colunaChegada: 'data_hora_efetiva_chegada',
    tabelaSolicitacao: 'solicitacoes_viagem',
    solicitacaoAtendida: 'AGENDADA',
    solicitacaoConcluida: 'CONCLUIDA',
    solicitacaoReaberta: 'APROVADA',
  },
  SVO: {
    tabela: 'ordens_svo',
    agendada: 'ALOCADA',
    emAndamento: 'EM_DESLOCAMENTO',
    colunaSaida: 'data_hora_saida',
    colunaChegada: 'data_hora_conclusao',
    tabelaSolicitacao: 'solicitacoes_svo',
    solicitacaoAtendida: 'EM_ANDAMENTO',
    solicitacaoConcluida: 'CONCLUIDA',
    solicitacaoReaberta: 'EM_TRIAGEM',
  },
} as const;

async function atualizarSolicitacao(
  trx: Knex.Transaction,
  tipo: TipoOperacao,
  solicitacaoId: number,
  status: string | null
) {
  if (status) {
    await trx(OPERACOES[tipo].tabelaSolicitacao).where({ id: solicitacaoId }).update({ status });
  }
}

const ORDENS_SVO_ABERTAS = ['ALOCADA', 'EM_DESLOCAMENTO'];
const SOLICITACOES_SVO_ABERTAS = ['EM_TRIAGEM', 'EM_ANDAMENTO'];

// Tipos de operação que cada perfil pode consultar e gerenciar
const TIPOS_POR_PERFIL: Partial<Record<Perfil, TipoOperacao[]>> = {
  [PERFIS.ADMINISTRADOR]: ['ADMINISTRATIVA', 'SVO'],
  [PERFIS.GESTOR_FROTA]: ['ADMINISTRATIVA'],
  [PERFIS.GESTOR_SVO]: ['SVO'],
};

function garantirAcesso(perfil: Perfil, tipo: TipoOperacao): void {
  if (!(TIPOS_POR_PERFIL[perfil] ?? []).includes(tipo)) {
    throw new AppError(
      'Você não tem permissão para gerenciar este tipo de viagem',
      403
    );
  }
}

async function garantirAcessoAoRegistro(
  trx: Knex.Transaction,
  autor: Autor,
  tipo: TipoOperacao,
  viagem: { motorista_id: number }
): Promise<void> {
  if (
    autor.perfil === PERFIS.MOTORISTA_FROTA ||
    autor.perfil === PERFIS.MOTORISTA_SVO
  ) {
    const tipoPermitido =
      autor.perfil === PERFIS.MOTORISTA_FROTA
        ? 'ADMINISTRATIVA'
        : 'SVO';

    if (tipo !== tipoPermitido) {
      throw new AppError(
        'Você não tem permissão para esta viagem',
        403
      );
    }

    const motorista = await trx('motoristas')
      .where({
        id: viagem.motorista_id,
        usuario_id: autor.id,
      })
      .first('id');

    if (!motorista) {
      throw new AppError(
        'Esta viagem não está vinculada ao motorista autenticado',
        403
      );
    }
    return;
  }
  garantirAcesso(autor.perfil, tipo);
}

// Situação de um recurso considerando viagens administrativas e ordens SVO
async function situacaoDoRecurso(
  trx: Knex.Transaction,
  coluna: 'veiculo_id' | 'motorista_id',
  id: number
) {
  const { rows } = await trx.raw<{ rows: { em_andamento: boolean | null; agendada: boolean | null }[] }>(
    `
    SELECT
      bool_or(status IN ('EM_ANDAMENTO', 'EM_DESLOCAMENTO')) AS em_andamento,
      bool_or(status IN ('AGENDADA', 'ALOCADA')) AS agendada
    FROM (
      SELECT status FROM viagens_frota WHERE ${coluna} = ?
      UNION ALL
      SELECT status FROM ordens_svo WHERE ${coluna} = ?
    ) AS viagens
    `,
    [id, id]
  );

  return {
    emAndamento: Boolean(rows[0]?.em_andamento),
    agendada: Boolean(rows[0]?.agendada),
  };
}

// Recalcula o status do veículo e do motorista a partir das viagens ativas.
// MANUTENCAO, INATIVO e AFASTADO são definidos fora das viagens e não são alterados.
async function sincronizarStatus(trx: Knex.Transaction, veiculoId: number, motoristaId: number) {
  const veiculo = await trx('veiculos').where({ id: veiculoId }).first('status');
  if (veiculo && !STATUS_VEICULO_BLOQUEADO.includes(veiculo.status)) {
    const situacao = await situacaoDoRecurso(trx, 'veiculo_id', veiculoId);
    const status = situacao.emAndamento ? 'EM_USO' : situacao.agendada ? 'RESERVADO' : 'DISPONIVEL';
    await veiculoModel.atualizarStatus(veiculoId, status, trx);
  }

  const motorista = await trx('motoristas').where({ id: motoristaId }).first('status');
  if (motorista && !STATUS_MOTORISTA_BLOQUEADO.includes(motorista.status)) {
    const situacao = await situacaoDoRecurso(trx, 'motorista_id', motoristaId);
    const status = situacao.emAndamento ? 'EM_VIAGEM' : situacao.agendada ? 'DESIGNADO' : 'DISPONIVEL';
    await motoristaModel.atualizarStatus(motoristaId, status, trx);
  }
}

// Busca e bloqueia as linhas para evitar alterações simultâneas
async function bloquearVeiculo(trx: Knex.Transaction, id: number) {
  const veiculo = await trx('veiculos').where({ id }).forUpdate().first();
  if (!veiculo) {
    throw new AppError('Veículo não encontrado', 404);
  }
  if (STATUS_VEICULO_BLOQUEADO.includes(veiculo.status)) {
    throw new AppError('O veículo está em manutenção', 400);
  }
  return veiculo;
}

async function bloquearMotorista(trx: Knex.Transaction, id: number) {
  const motorista = await trx('motoristas').where({ id }).forUpdate().first();
  if (!motorista) {
    throw new AppError('Motorista não encontrado', 404);
  }
  if (STATUS_MOTORISTA_BLOQUEADO.includes(motorista.status)) {
    throw new AppError('O motorista não está disponível', 400);
  }
  return motorista;
}

async function garantirCnhValida(trx: Knex.Transaction, motoristaId: number, ultimoDia: string) {
  const cnhValida = await trx('motoristas')
    .where({ id: motoristaId })
    .where('validade_cnh', '>=', ultimoDia)
    .first('id');
  if (!cnhValida) {
    throw new AppError('A CNH do motorista está vencida para a data da viagem', 400);
  }
}

async function criarViagemFrota(trx: Knex.Transaction, dados: CriarViagemFrotaInput) {
  // 1. Valida a solicitação
  const solicitacao = await trx('solicitacoes_viagem').where({ id: dados.solicitacao_id }).forUpdate().first();
  if (!solicitacao) {
    throw new AppError('Solicitação de viagem não encontrada', 404);
  }
  if (solicitacao.status !== 'APROVADA') {
    throw new AppError('Apenas solicitações aprovadas podem ser agendadas', 400);
  }
  const viagemAtiva = await trx('viagens_frota')
    .where({ solicitacao_id: dados.solicitacao_id })
    .whereIn('status', ['AGENDADA', 'EM_ANDAMENTO'])
    .first('id');
  if (viagemAtiva) {
    throw new AppError('A solicitação já possui uma viagem ativa', 409);
  }
  const { inicio, fim } = periodoDaSolicitacao(solicitacao);

  // 2. Valida veiculo
  const veiculo = await bloquearVeiculo(trx, dados.veiculo_id);
  if (veiculo.tipo_frota !== 'ADMINISTRATIVA') {
    throw new AppError('O veículo não pertence à frota administrativa', 400);
  }
  const conflitoVeiculo = await viagensConflitantes(trx, inicio, fim)
    .where('vf.veiculo_id', dados.veiculo_id)
    .first('vf.id');
  if (conflitoVeiculo) {
    throw new AppError('O veículo já possui viagem no período solicitado', 409);
  }

  // 3. Valida motorista
  const motorista = await bloquearMotorista(trx, dados.motorista_id);
  if (motorista.tipo_motorista !== 'FROTA') {
    throw new AppError('O motorista não pertence à frota administrativa', 400);
  }
  await garantirCnhValida(trx, dados.motorista_id, ultimoDiaDaSolicitacao(solicitacao));
  const conflitoMotorista = await viagensConflitantes(trx, inicio, fim)
    .where('vf.motorista_id', dados.motorista_id)
    .first('vf.id');
  if (conflitoMotorista) {
    throw new AppError('O motorista já possui viagem no período solicitado', 409);
  }

  // 4. Cria o registro da viagem
  const [viagem] = await trx('viagens_frota')
    .insert({
      solicitacao_id: dados.solicitacao_id,
      veiculo_id: dados.veiculo_id,
      motorista_id: dados.motorista_id,
      status: 'AGENDADA',
    })
    .returning('id');

  return viagem.id as number;
}

async function criarOrdemSvo(trx: Knex.Transaction, dados: CriarOrdemSvoInput) {
  // 1. Valida a solicitação SVO
  const solicitacao = await trx('solicitacoes_svo').where({ id: dados.solicitacao_id }).forUpdate().first();
  if (!solicitacao) {
    throw new AppError('Solicitação SVO não encontrada', 404);
  }
  if (!SOLICITACOES_SVO_ABERTAS.includes(solicitacao.status)) {
    throw new AppError('A solicitação SVO já foi concluída ou cancelada', 400);
  }
  const ordemAtiva = await trx('ordens_svo')
    .where({ solicitacao_id: dados.solicitacao_id })
    .whereIn('status', ORDENS_SVO_ABERTAS)
    .first('id');
  if (ordemAtiva) {
    throw new AppError('A solicitação SVO já possui uma ordem ativa', 409);
  }

  // 2. Valida veiculo e capacidade (RNF10)
  const veiculo = await bloquearVeiculo(trx, dados.veiculo_id);
  if (veiculo.tipo_frota !== 'SVO') {
    throw new AppError('O veículo não pertence à frota SVO', 400);
  }
  const ordensDoVeiculo: { motorista_id: number; capacidade_utilizada: number; status: string }[] =
    await trx('ordens_svo')
      .where({ veiculo_id: dados.veiculo_id })
      .whereIn('status', ORDENS_SVO_ABERTAS)
      .select('motorista_id', 'capacidade_utilizada', 'status');
  if (ordensDoVeiculo.some((ordem) => ordem.status === 'EM_DESLOCAMENTO')) {
    throw new AppError('O veículo está em deslocamento', 409);
  }
  if (ordensDoVeiculo.some((ordem) => ordem.motorista_id !== dados.motorista_id)) {
    throw new AppError('O veículo já está alocado a outro motorista', 409);
  }
  const vagas =
    veiculo.capacidade_maxima - ordensDoVeiculo.reduce((total, ordem) => total + ordem.capacidade_utilizada, 0);
  if (dados.capacidade_utilizada > vagas) {
    throw new AppError(`O veículo não tem capacidade suficiente (vagas disponíveis: ${Math.max(vagas, 0)})`, 409);
  }

  // 3. Valida motorista
  const motorista = await bloquearMotorista(trx, dados.motorista_id);
  if (motorista.tipo_motorista !== 'SVO') {
    throw new AppError('O motorista não pertence ao SVO', 400);
  }
  // A ordem SVO é atendida no mesmo dia: a CNH precisa estar válida hoje
  await garantirCnhValida(trx, dados.motorista_id, ultimoDiaDaSolicitacao({ data_saida_desejada: new Date() }));
  const ordemEmOutroVeiculo = await trx('ordens_svo')
    .where({ motorista_id: dados.motorista_id })
    .whereIn('status', ORDENS_SVO_ABERTAS)
    .whereNot({ veiculo_id: dados.veiculo_id })
    .first('id');
  if (ordemEmOutroVeiculo) {
    throw new AppError('O motorista já está alocado em outro veículo', 409);
  }

  // 4. Valida a equipe, se informada
  if (dados.equipe_id) {
    const equipe = await trx('equipes_svo').where({ id: dados.equipe_id }).first('id');
    if (!equipe) {
      throw new AppError('Equipe SVO não encontrada', 404);
    }
  }

  // 5. Cria a ordem
  const [ordem] = await trx('ordens_svo')
    .insert({
      solicitacao_id: dados.solicitacao_id,
      veiculo_id: dados.veiculo_id,
      motorista_id: dados.motorista_id,
      equipe_id: dados.equipe_id ?? null,
      capacidade_utilizada: dados.capacidade_utilizada,
      status: 'ALOCADA',
    })
    .returning('id');

  return ordem.id as number;
}

async function registrarAuditoria(trx: Knex.Transaction, autorId: number, acao: string) {
  await auditoriaModel.registrar(
    {
      usuario_id: autorId,
      acao,
      modulo: MODULOS_AUDITORIA.VIAGENS,
    },
    trx
  );
}

async function buscarParaAtualizar(trx: Knex.Transaction, tipo: TipoOperacao, id: number) {
  const viagem = await trx(OPERACOES[tipo].tabela).where({ id }).forUpdate().first();
  if (!viagem) {
    throw new AppError('Viagem não encontrada', 404);
  }
  return viagem;
}

async function detalhar(trx: Knex.Transaction, tipo: TipoOperacao, id: number): Promise<ViagemDetalhada> {
  const viagem = await viagemModel.buscarPorId(tipo, id, trx);
  if (!viagem) {
    throw new AppError('Viagem não encontrada', 404);
  }
  return viagem;
}

export const viagemService = {
  async listar(autor: Autor): Promise<ViagemDetalhada[]> {
  if (autor.perfil === PERFIS.MOTORISTA_FROTA) {
    return viagemModel.listar(['ADMINISTRATIVA'], autor.id);
  }

  if (autor.perfil === PERFIS.MOTORISTA_SVO) {
    return viagemModel.listar(['SVO'], autor.id);
  }

  const tiposPermitidos = TIPOS_POR_PERFIL[autor.perfil] ?? [];

  return viagemModel.listar(tiposPermitidos);
  },
  async criar(dados: CriarViagemInput, autor: Autor): Promise<ViagemDetalhada> {
    garantirAcesso(autor.perfil, dados.tipo_operacao);

    return db.transaction(async (trx) => {
      const id =
        dados.tipo_operacao === 'SVO' ? await criarOrdemSvo(trx, dados) : await criarViagemFrota(trx, dados);

      // Veículo → RESERVADO e motorista → DESIGNADO
      await sincronizarStatus(trx, dados.veiculo_id, dados.motorista_id);
      await atualizarSolicitacao(
        trx,
        dados.tipo_operacao,
        dados.solicitacao_id,
        OPERACOES[dados.tipo_operacao].solicitacaoAtendida
      );

      await registrarAuditoria(
        trx,
        autor.id,
        `CRIOU_VIAGEM tipo=${dados.tipo_operacao} id=${id} veiculo=${dados.veiculo_id} motorista=${dados.motorista_id}`
      );

      return detalhar(trx, dados.tipo_operacao, id);
    });
  },

  async iniciarViagem(tipo: TipoOperacao, viagemId: number, kmInicial: number, autor: Autor) {
    const operacao = OPERACOES[tipo];

    return db.transaction(async (trx) => {
      const viagem = await buscarParaAtualizar(trx, tipo, viagemId);
      await garantirAcessoAoRegistro(trx, autor, tipo, viagem);
      if (viagem.status !== operacao.agendada) {
        throw new AppError('Apenas viagens agendadas podem ser iniciadas', 400);
      }

      // Valida veiculo e quilometragem
      const veiculo = await bloquearVeiculo(trx, viagem.veiculo_id);
      if (kmInicial < veiculo.km_atual) {
        throw new AppError(
          `O km inicial não pode ser menor que o km atual do veículo (${veiculo.km_atual})`,
          400
        );
      }
      await bloquearMotorista(trx, viagem.motorista_id);

      // Na frota administrativa, o veículo e o motorista fazem uma viagem por vez.
      // No SVO, as ordens alocadas no mesmo veículo seguem juntas.
      if (tipo === 'ADMINISTRATIVA') {
        if ((await situacaoDoRecurso(trx, 'veiculo_id', viagem.veiculo_id)).emAndamento) {
          throw new AppError('O veículo já está em outra viagem em andamento', 409);
        }
        if ((await situacaoDoRecurso(trx, 'motorista_id', viagem.motorista_id)).emAndamento) {
          throw new AppError('O motorista já está em outra viagem em andamento', 409);
        }
      }

      // Atualiza a viagem
      await trx(operacao.tabela)
        .where({ id: viagemId })
        .update({
          status: operacao.emAndamento,
          km_inicial: kmInicial,
          ...(operacao.colunaSaida && { [operacao.colunaSaida]: new Date() }),
        });

      // Veículo → EM_USO e motorista → EM_VIAGEM
      await sincronizarStatus(trx, viagem.veiculo_id, viagem.motorista_id);

      await registrarAuditoria(trx, autor.id, `INICIOU_VIAGEM tipo=${tipo} id=${viagemId} km_inicial=${kmInicial}`);

      return detalhar(trx, tipo, viagemId);
    });
  },

  async finalizarViagem(tipo: TipoOperacao, viagemId: number, kmFinal: number, autor: Autor) {
    const operacao = OPERACOES[tipo];

    return db.transaction(async (trx) => {
    const viagem = await buscarParaAtualizar(trx, tipo, viagemId);

      await garantirAcessoAoRegistro(trx, autor, tipo, viagem);

      if (viagem.status !== operacao.emAndamento) {
      throw new AppError('Apenas viagens em andamento podem ser finalizadas', 400);
    }
      if (kmFinal < viagem.km_inicial) {
        throw new AppError('O km final não pode ser menor que o km inicial', 400);
      }

      // Atualiza a viagem
      await trx(operacao.tabela)
        .where({ id: viagemId })
        .update({
          status: 'CONCLUIDA',
          km_final: kmFinal,
          [operacao.colunaChegada]: new Date(),
        });

      // Atualiza km do veiculo sem reduzir o valor já registrado
      await trx('veiculos')
        .where({ id: viagem.veiculo_id })
        .update({ km_atual: trx.raw('GREATEST(km_atual, ?)', [kmFinal]) });

      // Veículo e motorista voltam para DISPONIVEL (ou RESERVADO/DESIGNADO, se houver outra viagem agendada)
      await sincronizarStatus(trx, viagem.veiculo_id, viagem.motorista_id);
      await atualizarSolicitacao(trx, tipo, viagem.solicitacao_id, operacao.solicitacaoConcluida);

      await registrarAuditoria(trx, autor.id, `FINALIZOU_VIAGEM tipo=${tipo} id=${viagemId} km_final=${kmFinal}`);

      return detalhar(trx, tipo, viagemId);
    });
  },

  // cancelarSolicitacao: também cancela a solicitação; sem ele, a solicitação pode ser atendida de novo
  async cancelarViagem(tipo: TipoOperacao, viagemId: number, autor: Autor, cancelarSolicitacao = false) {
    garantirAcesso(autor.perfil, tipo);
    const operacao = OPERACOES[tipo];

    return db.transaction(async (trx) => {
      const viagem = await buscarParaAtualizar(trx, tipo, viagemId);
      if (viagem.status !== operacao.agendada) {
        throw new AppError('Apenas viagens agendadas podem ser canceladas', 400);
      }

      await trx(operacao.tabela).where({ id: viagemId }).update({ status: 'CANCELADA' });

      // Libera veículo e motorista, se não houver outra viagem ativa
      await sincronizarStatus(trx, viagem.veiculo_id, viagem.motorista_id);
      await atualizarSolicitacao(
        trx,
        tipo,
        viagem.solicitacao_id,
        cancelarSolicitacao ? 'CANCELADA' : operacao.solicitacaoReaberta
      );

      await registrarAuditoria(
        trx,
        autor.id,
        `CANCELOU_VIAGEM tipo=${tipo} id=${viagemId}${cancelarSolicitacao ? ' solicitacao_cancelada' : ''}`
      );

      return detalhar(trx, tipo, viagemId);
    });
  },
};
