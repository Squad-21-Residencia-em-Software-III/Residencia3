import type { Knex } from 'knex';
import { db } from '../config/database';
import { configNotificacoes } from '../config/notificacoes';
import { PERFIS, type Perfil } from '../constants/perfis';
import { ORDENS_SVO_EM_CURSO, ordemSvoEmCurso } from '../constants/statusOrdemSvo';
import { AppError } from '../errors/AppError';
import { acompanhamentoExternoSvoModel } from '../models/acompanhamentoExternoSvoModel';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { motoristaModel } from '../models/motoristaModel';
import { solicitacaoViagemModel } from '../models/solicitacaoViagemModel';
import { veiculoModel } from '../models/veiculoModel';
import { viagemModel, type ViagemDetalhada } from '../models/viagemModel';
import { unidadeModel } from '../models/unidadeModel';
import type { CriarViagemInput, ReprogramarViagemAdministrativaInput, TipoOperacao } from '../validators/viagemSchemas';
import { travarAgendaSvo, validarAgendaSvo } from './agendaSvoService';
import { garantirPerfilOperacional } from './autorizacaoOperacionalSvo';
import { concluirOperacao, registrarEvidenciaNaTransicao } from './evidenciaOdometroTransicao';
import { reavaliarFilaSvo } from './filaSvoService';
import { notificacaoSvoService } from './notificacaoSvoService';
import { publicarNotificacao } from './publicacaoNotificacoes';
import { buscarDestinatariosViagemAdministrativa } from './avisosViagem';
import {
  montarAvisoViagemAgendada,
  montarAvisosViagemCancelada,
  montarAvisosAndamentoViagem,
  montarAvisosViagemReprogramada,
} from './eventosViagemAdministrativa';
import { prepararEventoViagem } from './publicacaoEventosViagem';
import { atualizarDesignacoesSvo } from './designacoesSvoService';
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
type AlocarOrdemSvoInput = Extract<CriarViagemInput, { tipo_operacao: 'SVO' }>;

// Tabela e status equivalentes de cada tipo de operação.
// solicitacao*: status que a solicitação recebe em cada etapa (null = não muda).
// A solicitação administrativa fica AGENDADA durante a viagem, CONCLUIDA ao final
// e volta a APROVADA (pode ser agendada de novo) quando a viagem é cancelada.
export const OPERACOES = {
  ADMINISTRATIVA: {
    tabela: 'viagens_frota',
    agendada: 'AGENDADA',
    emAndamento: 'EM_ANDAMENTO',
    colunaSaida: 'data_hora_efetiva_saida',
    colunaChegada: 'data_hora_efetiva_chegada',
    tabelaSolicitacao: 'solicitacoes_viagem',
    colunaDestino: 'destino',
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
    colunaDestino: 'local_ocorrencia',
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
    // Solicitação SVO que volta à triagem precisa ser confirmada de novo (BL27):
    // a confirmação anterior não vale mais
    const limparConfirmacao = tipo === 'SVO' && status === OPERACOES.SVO.solicitacaoReaberta;
    await trx(OPERACOES[tipo].tabelaSolicitacao)
      .where({ id: solicitacaoId })
      .update(limparConfirmacao ? { status, confirmado_por: null, confirmado_em: null } : { status });
  }
}

// Tipos de operação que cada perfil pode consultar e gerenciar
export const TIPOS_POR_PERFIL: Partial<Record<Perfil, TipoOperacao[]>> = {
  [PERFIS.ADMINISTRADOR]: ['ADMINISTRATIVA', 'SVO'],
  [PERFIS.GESTOR_FROTA]: ['ADMINISTRATIVA'],
  [PERFIS.GESTOR_SVO]: ['SVO'],
};

export function garantirAcesso(perfil: Perfil, tipo: TipoOperacao): void {
  if (!(TIPOS_POR_PERFIL[perfil] ?? []).includes(tipo)) {
    throw new AppError(
      'Você não tem permissão para gerenciar este tipo de viagem',
      403
    );
  }
}

export async function garantirAcessoAoRegistro(
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
      bool_or(status IN ('EM_ANDAMENTO', ?, ?)) AS em_andamento,
      bool_or(status IN ('AGENDADA', 'ALOCADA')) AS agendada
    FROM (
      SELECT status FROM viagens_frota WHERE ${coluna} = ?
      UNION ALL
      SELECT status FROM ordens_svo WHERE ${coluna} = ?
    ) AS viagens
    `,
    [...ORDENS_SVO_EM_CURSO, id, id]
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

function erroSolicitacaoExpirada(): AppError {
  return new AppError(
    'A solicitação expirou 30 minutos após a saída pretendida e não pode mais ser agendada.',
    409,
    'SOLICITACAO_EXPIRADA',
  );
}

async function criarViagemFrota(trx: Knex.Transaction, dados: CriarViagemFrotaInput) {
  // 1. Valida a solicitação
  const solicitacao = await trx('solicitacoes_viagem').where({ id: dados.solicitacao_id }).forUpdate().first();
  if (!solicitacao) {
    throw new AppError('Solicitação de viagem não encontrada', 404);
  }
  if (solicitacao.status === 'EXPIRADA') throw erroSolicitacaoExpirada();
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
  if (await solicitacaoViagemModel.prazoDeAgendamentoVencido(trx, solicitacao.id)) {
    throw erroSolicitacaoExpirada();
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

  // Os locks dos recursos podem ter demorado. Confira o prazo junto da gravação.
  if (await solicitacaoViagemModel.prazoDeAgendamentoVencido(trx, solicitacao.id)) {
    throw erroSolicitacaoExpirada();
  }

  // 4. Cria o registro da viagem
  const [viagem] = await trx('viagens_frota')
    .insert({
      solicitacao_id: dados.solicitacao_id,
      veiculo_id: dados.veiculo_id,
      motorista_id: dados.motorista_id,
      status: 'AGENDADA',
      inicio_previsto: inicio,
      fim_previsto: fim,
    })
    .returning('id');

  return viagem.id as number;
}

async function alocarOrdemSvo(trx: Knex.Transaction, dados: AlocarOrdemSvoInput, autorId: number, ordemReprogramada?: number) {
  // 1. Valida a solicitação SVO
  const solicitacao = await trx('solicitacoes_svo').where({ id: dados.solicitacao_id }).forUpdate().first();
  if (!solicitacao) {
    throw new AppError('Solicitação SVO não encontrada', 404);
  }
  if (solicitacao.status !== (ordemReprogramada ? 'EM_ANDAMENTO' : 'CONFIRMADA')) {
    throw new AppError('A solicitação SVO deve estar confirmada antes da alocação', 409);
  }
  const ordemPendente = await trx('ordens_svo')
    .where({ solicitacao_id: dados.solicitacao_id })
    .where({ status: ordemReprogramada ? 'ALOCADA' : 'AGUARDANDO_ALOCACAO' })
    .modify((q) => { if (ordemReprogramada) q.where('id', ordemReprogramada); })
    .forUpdate()
    .first('id', 'equipe_id');
  if (!ordemPendente) {
    throw new AppError('A solicitação SVO não possui ordem aguardando alocação', 409);
  }

  // 2. Valida veiculo e capacidade (RNF10)
  const veiculo = await bloquearVeiculo(trx, dados.veiculo_id);
  if (veiculo.tipo_frota !== 'SVO') {
    throw new AppError('O veículo não pertence à frota SVO', 400);
  }
  if (!Number.isInteger(dados.capacidade_utilizada) || dados.capacidade_utilizada < 1 ||
      dados.capacidade_utilizada > 4 || dados.capacidade_utilizada > veiculo.capacidade_maxima) {
    throw new AppError('O veículo não tem capacidade suficiente', 409);
  }

  // 3. Valida motorista
  const motorista = await bloquearMotorista(trx, dados.motorista_id);
  if (motorista.tipo_motorista !== 'SVO') {
    throw new AppError('O motorista não pertence ao SVO', 400);
  }
  const inicio = new Date(dados.inicio_previsto);
  const fim = new Date(dados.fim_previsto);
  await garantirCnhValida(trx, dados.motorista_id, ultimoDiaDaSolicitacao({
    data_saida_desejada: inicio, data_chegada_desejada: fim,
  }));

  // 4. Valida a equipe, se informada
  const mesmaEquipe = ordemReprogramada !== undefined && ordemPendente.equipe_id === (dados.equipe_id ?? null);
  const designacoesAtuais: { usuario_id: number }[] = mesmaEquipe && dados.integrantes_ids === undefined && dados.equipe_id
    ? await trx('ordens_svo_integrantes').where({ ordem_id: ordemPendente.id })
      .whereNull('revogado_em').select('usuario_id')
    : [];
  const integrantes = dados.integrantes_ids ?? designacoesAtuais.map((d) => d.usuario_id);
  if (dados.equipe_id) {
    const equipe = await trx('equipes_svo').where({ id: dados.equipe_id }).forUpdate().first('id');
    if (!equipe) {
      throw new AppError('Equipe SVO não encontrada', 404);
    }
  }

  const conflitoAdministrativo = await viagensConflitantes(trx, inicio, fim)
    .andWhere((q) => q.where('vf.veiculo_id', dados.veiculo_id).orWhere('vf.motorista_id', dados.motorista_id))
    .first('vf.id');
  if (conflitoAdministrativo) throw new AppError('Um recurso já está reservado no período solicitado', 409, 'CONFLITO_AGENDA');
  const conflitos = await validarAgendaSvo(trx, {
    ordemId: ordemPendente.id, autorId, veiculoId: dados.veiculo_id,
    motoristaId: dados.motorista_id, equipeId: dados.equipe_id, integrantesIds: integrantes, inicio, fim,
    confirmar: dados.confirmar_intervalo_reduzido, token: dados.token_confirmacao,
  });

  if (dados.equipe_id || integrantes.length || ordemReprogramada) {
    await atualizarDesignacoesSvo(trx, { ordemId: ordemPendente.id, equipeId: dados.equipe_id ?? null,
      integrantes, lotacao: veiculo.lotacao_cabine, inicio, fim, autorId });
  }

  // 5. Aloca a ordem gerada na confirmação, preservando seu identificador.
  await trx('ordens_svo')
    .where({ id: ordemPendente.id })
    .update({
      veiculo_id: dados.veiculo_id,
      motorista_id: dados.motorista_id,
      equipe_id: dados.equipe_id ?? null,
      capacidade_utilizada: dados.capacidade_utilizada,
      inicio_previsto: inicio,
      fim_previsto: fim,
      liberada_em: null,
      status: 'ALOCADA',
    });

  if (conflitos.length) {
    await registrarAuditoria(trx, autorId, `CONFIRMOU_INTERVALO_SVO ordem=${ordemPendente.id} inicio=${inicio.toISOString()} fim=${fim.toISOString()}`);
    for (const conflito of conflitos) {
      await registrarAuditoria(trx, autorId, `INTERVALO_SVO ordem=${ordemPendente.id} recurso=${conflito.recurso}${conflito.descricao} reserva=${conflito.ordem_id} inicio=${conflito.inicio} fim=${conflito.fim} minutos=${conflito.intervalo_minutos}`);
    }
  }
  return ordemPendente.id as number;
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

export async function buscarParaAtualizar(trx: Knex.Transaction, tipo: TipoOperacao, id: number) {
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
  async registrarChegadaLocalSvo(ordemId: number, autor: Autor) {
    garantirPerfilOperacional('SVO', autor);
    return db.transaction(async (trx) => {
      await travarAgendaSvo(trx);

      const ordem = await buscarParaAtualizar(trx, 'SVO', ordemId);

      await garantirAcessoAoRegistro(trx, autor, 'SVO', ordem);

      if (ordem.status !== 'EM_DESLOCAMENTO') {
        throw new AppError(
          'Apenas coletas em deslocamento podem registrar chegada ao local',
          409
        );
      }

      await trx('ordens_svo')
        .where({ id: ordemId })
        .update({ status: 'NO_LOCAL' });

      await registrarAuditoria(
        trx,
        autor.id,
        `CHEGOU_LOCAL_SVO id=${ordemId}`
      );
      // S6 (SCRUM-235): só na central, sem push
      await notificacaoSvoService.publicarChegadaLocal(ordemId, autor.id, trx);

      return detalhar(trx, 'SVO', ordemId);
    });
  },

  async reprogramarOrdemSvo(id: number, dados: AlocarOrdemSvoInput, autor: Autor) {
    garantirAcesso(autor.perfil, 'SVO');
    return db.transaction(async (trx) => {
      await travarAgendaSvo(trx);
      const anterior = await buscarParaAtualizar(trx, 'SVO', id);
      if (anterior.status !== 'ALOCADA') throw new AppError('Apenas coletas agendadas podem ser reprogramadas', 409);
      if (dados.solicitacao_id !== anterior.solicitacao_id) throw new AppError('Solicitação não corresponde à ordem', 409);
      const equipeAntes = await notificacaoSvoService.equipeParaAvisos(trx, id);
      await alocarOrdemSvo(trx, dados, autor.id, id);
      await trx('alertas_atraso_svo').where({ ordem_afetada_id: id }).whereNull('resolvido_em')
        .update({ resolvido_em: trx.fn.now() });
      await sincronizarStatus(trx, anterior.veiculo_id, anterior.motorista_id);
      await sincronizarStatus(trx, dados.veiculo_id, dados.motorista_id);
      await reavaliarFilaSvo(trx, autor.id);
      const acao = `REPROGRAMOU_SVO id=${id} inicio=${dados.inicio_previsto} fim=${dados.fim_previsto} veiculo=${dados.veiculo_id} motorista=${dados.motorista_id} equipe=${dados.equipe_id ?? 'nenhuma'}`;
      const equipeDepois = await notificacaoSvoService.equipeParaAvisos(trx, id);
      if (equipeAntes && equipeDepois) {
        const auditoriaId = await auditoriaModel.registrarComId({
          usuario_id: autor.id, modulo: MODULOS_AUDITORIA.VIAGENS, acao,
        }, trx);
        await notificacaoSvoService.publicarDesignacoes(equipeAntes, equipeDepois, autor.id, trx, auditoriaId);
      } else {
        await registrarAuditoria(trx, autor.id, acao);
      }
      return detalhar(trx, 'SVO', id);
    });
  },
  async consultarAlertasSvo(autor: Autor, pagina: number, limite: number) {
    garantirAcesso(autor.perfil, 'SVO');
    return db.transaction(async (trx) => {
      await travarAgendaSvo(trx);
      await reavaliarFilaSvo(trx, autor.id);
      const consulta = () => trx('alertas_atraso_svo as a')
        .join('ordens_svo as anterior', 'anterior.id', 'a.ordem_em_atraso_id')
        .join('ordens_svo as afetada', 'afetada.id', 'a.ordem_afetada_id')
        .whereNull('a.resolvido_em');
      const [dados, contagem] = await Promise.all([
        consulta()
        .select('a.id', 'a.ordem_em_atraso_id', 'a.ordem_afetada_id', 'a.criado_em',
          'anterior.fim_previsto as fim_previsto_anterior', 'afetada.inicio_previsto as inicio_previsto_afetada')
        .orderBy('afetada.inicio_previsto').orderBy('afetada.id').orderBy('a.id')
        .limit(limite).offset((pagina - 1) * limite),
        consulta().count<{ total: string }[]>({ total: 'a.id' }).first(),
      ]);
      const total = Number(contagem?.total ?? 0);
      return { dados, paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) } };
    });
  },
  async listarOrdensPendentesSvo(autor: Autor, pagina: number, limite: number) {
    garantirAcesso(autor.perfil, 'SVO');
    return viagemModel.listarOrdensPendentesSvo(pagina, limite);
  },
  async listarMinhasAdministrativas(autor: Autor, pagina: number, limite: number) {
    if (autor.perfil !== PERFIS.GESTOR_SVO) {
      throw new AppError('Você não tem permissão para esta consulta', 403);
    }
    return viagemModel.listarAdministrativasDoSolicitante(autor.id, pagina, limite);
  },
  async listar(autor: Autor): Promise<ViagemDetalhada[]> {
  if (autor.perfil === PERFIS.MOTORISTA_FROTA) {
    return viagemModel.listar(['ADMINISTRATIVA'], autor.id);
  }

  if (autor.perfil === PERFIS.MOTORISTA_SVO) {
    return viagemModel.listar(['SVO'], autor.id);
  }

  const tiposPermitidos = TIPOS_POR_PERFIL[autor.perfil] ?? [];

  const viagens = await viagemModel.listar(tiposPermitidos);
  if (!viagens.length || !tiposPermitidos.includes('ADMINISTRATIVA')) return viagens;
  const unidades = autor.perfil === PERFIS.GESTOR_FROTA
    ? await unidadeModel.idsDasUnidadesDoGestor(autor.id) : [];
  return viagens.map((v) => v.tipo_operacao === 'ADMINISTRATIVA' ? {
    ...v,
    pode_reprogramar: v.status === 'AGENDADA' && !v.data_hora_efetiva_saida && !v.data_hora_efetiva_chegada &&
      (autor.perfil === PERFIS.ADMINISTRADOR || (v.unidade_id != null && unidades.includes(v.unidade_id))),
  } : v);
  },
  // A6: somente o período muda; os recursos, a aprovação, as evidências e os horários reais permanecem.
  async reprogramarAdministrativa(id: number, dados: ReprogramarViagemAdministrativaInput, autor: Autor): Promise<ViagemDetalhada> {
    if (autor.perfil !== PERFIS.ADMINISTRADOR && autor.perfil !== PERFIS.GESTOR_FROTA) throw new AppError('Sem permissão para reprogramar', 403);
    if (dados.tipo_operacao !== 'ADMINISTRATIVA') throw new AppError('Operação inválida', 400);
    const inicio = new Date(dados.inicio_previsto);
    const fim = new Date(dados.fim_previsto);
    if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) {
      throw new AppError('O término planejado deve ser posterior ao início', 400);
    }
    return db.transaction(async (trx) => {
      const viagem = await buscarParaAtualizar(trx, 'ADMINISTRATIVA', id);
      const solicitacao = await trx('solicitacoes_viagem').where({ id: viagem.solicitacao_id }).first();
      if (!solicitacao) throw new AppError('Solicitação da viagem não encontrada', 404);
      // A competência geral para analisar solicitações não concede reprogramação de unidade alheia.
      if (autor.perfil !== PERFIS.ADMINISTRADOR) {
        const vinculo = solicitacao.unidade_id != null && await trx('gestores_unidades')
          .where({ unidade_id: solicitacao.unidade_id, usuario_id: autor.id }).forShare().first('unidade_id');
        if (!vinculo) throw new AppError('Você não tem autorização para reprogramar esta unidade', 403);
      }
      const chave = dados.chave_idempotencia.toLowerCase();
      const anterior = await trx('reprogramacoes_viagem_frota').where({ viagem_id: id, chave }).first();
      if (anterior) {
        if (anterior.autor_id !== autor.id || anterior.versao_esperada !== dados.versao_programacao ||
          new Date(anterior.inicio_previsto).getTime() !== inicio.getTime() ||
          new Date(anterior.fim_previsto).getTime() !== fim.getTime()) {
          throw new AppError('Chave de reprogramação já utilizada com outros dados', 409);
        }
        // Mesmo se a viagem foi reprogramada novamente, o retry nunca reaplica o comando.
        return detalhar(trx, 'ADMINISTRATIVA', id);
      }
      if (viagem.status !== 'AGENDADA' || solicitacao.status !== 'AGENDADA' ||
          viagem.data_hora_efetiva_saida != null || viagem.data_hora_efetiva_chegada != null) {
        throw new AppError('Somente viagens agendadas e ainda não iniciadas podem ser reprogramadas', 409);
      }
      if (viagem.versao_programacao !== dados.versao_programacao) {
        throw new AppError('A programação mudou. Atualize a viagem antes de tentar novamente.', 409, 'PROGRAMACAO_DESATUALIZADA');
      }
      const periodo = periodoDaSolicitacao({
        data_saida_desejada: viagem.inicio_previsto ?? solicitacao.data_saida_desejada,
        data_chegada_desejada: viagem.fim_previsto ?? solicitacao.data_chegada_desejada,
      });
      const mudou = periodo.inicio.getTime() !== inicio.getTime() || periodo.fim.getTime() !== fim.getTime();
      let auditoriaId: number | null = null;
      if (mudou) {
        // Mesma ordem e mesmas linhas bloqueadas pela criação/alocação e início: veículo, motorista.
        // A viagem está bloqueada desde a leitura, portanto cancelamento/início e retries são serializados.
        const veiculo = await bloquearVeiculo(trx, viagem.veiculo_id);
        if (veiculo.tipo_frota !== 'ADMINISTRATIVA') throw new AppError('Veículo fora da frota administrativa', 400);
        const motorista = await bloquearMotorista(trx, viagem.motorista_id);
        if (motorista.tipo_motorista !== 'FROTA') throw new AppError('Motorista fora da frota administrativa', 400);
        await garantirCnhValida(trx, viagem.motorista_id, ultimoDiaDaSolicitacao({
          data_saida_desejada: inicio, data_chegada_desejada: fim,
        }));
        const conflito = () => viagensConflitantes(trx, inicio, fim).whereNot('vf.id', id);
        if (await conflito().where('vf.veiculo_id', viagem.veiculo_id).first('vf.id')) {
          throw new AppError('O veículo já possui viagem no período planejado', 409, 'CONFLITO_AGENDA');
        }
        if (await conflito().where('vf.motorista_id', viagem.motorista_id).first('vf.id')) {
          throw new AppError('O motorista já possui viagem no período planejado', 409, 'CONFLITO_AGENDA');
        }
        // Evidências e exceções são vinculadas ao mesmo registro, condutor, veículo e fase.
        // Nenhum desses vínculos muda: preserva-se a autorização e a validade original das evidências.
        await trx('viagens_frota').where({ id }).update({
          inicio_previsto: inicio, fim_previsto: fim, versao_programacao: viagem.versao_programacao + 1,
        });
        auditoriaId = await auditoriaModel.registrarComId({
          usuario_id: autor.id, modulo: MODULOS_AUDITORIA.VIAGENS,
          acao: `REPROGRAMOU_VIAGEM id=${id} antes=${periodo.inicio.toISOString()}/${periodo.fim.toISOString()} depois=${inicio.toISOString()}/${fim.toISOString()}`,
        }, trx);
        if (configNotificacoes.ativas) {
          const destinatarios = await buscarDestinatariosViagemAdministrativa(trx, id);
          const avisos = montarAvisosViagemReprogramada(id, `auditoria:${auditoriaId}`);
          await publicarNotificacao(trx, prepararEventoViagem(id, avisos.motorista, autor.id, destinatarios.motorista));
          const motoristas = new Set(destinatarios.motorista);
          await publicarNotificacao(trx, prepararEventoViagem(id, avisos.solicitante, autor.id,
            destinatarios.solicitante.filter((uid) => !motoristas.has(uid))));
        }
      }
      // Persiste inclusive a resposta sem alteração: retry posterior não se transforma em mudança.
      await trx('reprogramacoes_viagem_frota').insert({
        viagem_id: id, chave, autor_id: autor.id, versao_esperada: dados.versao_programacao,
        inicio_previsto: inicio, fim_previsto: fim, auditoria_id: auditoriaId,
      });
      return detalhar(trx, 'ADMINISTRATIVA', id);
    });
  },

  async criar(dados: CriarViagemInput, autor: Autor): Promise<ViagemDetalhada> {
    garantirAcesso(autor.perfil, dados.tipo_operacao);

    return db.transaction(async (trx) => {
      const id =
        dados.tipo_operacao === 'SVO'
          ? (await travarAgendaSvo(trx), await alocarOrdemSvo(trx, dados, autor.id))
          : await criarViagemFrota(trx, dados);

      // Veículo → RESERVADO e motorista → DESIGNADO
      await sincronizarStatus(trx, dados.veiculo_id, dados.motorista_id);
      await atualizarSolicitacao(
        trx,
        dados.tipo_operacao,
        dados.solicitacao_id,
        OPERACOES[dados.tipo_operacao].solicitacaoAtendida
      );
      if (dados.tipo_operacao === 'SVO') {
        await reavaliarFilaSvo(trx, autor.id);
        // S3 (SCRUM-234): motorista e integrantes designados, individualmente
        await notificacaoSvoService.publicarDesignacoes(null, await notificacaoSvoService.equipeParaAvisos(trx, id), autor.id, trx);
      }

      await registrarAuditoria(
        trx,
        autor.id,
        `${dados.tipo_operacao === 'SVO' ? 'ALOCOU_ORDEM_SVO' : 'CRIOU_VIAGEM'} tipo=${dados.tipo_operacao} id=${id} veiculo=${dados.veiculo_id} motorista=${dados.motorista_id}`
      );

      if (dados.tipo_operacao === 'ADMINISTRATIVA' && configNotificacoes.ativas) {
        const destinatarios = await buscarDestinatariosViagemAdministrativa(trx, id);
        const aviso = montarAvisoViagemAgendada(id);
        await publicarNotificacao(
          trx,
          prepararEventoViagem(id, aviso, autor.id, destinatarios.motorista)
        );
      }

      return detalhar(trx, dados.tipo_operacao, id);
    });
  },

  // evidenciaId: foto do odômetro enviada antes em POST /evidencias-odometro (SCRUM-208)
  async iniciarViagem(tipo: TipoOperacao, viagemId: number, kmInicial: number, autor: Autor, evidenciaId?: number) {
    garantirPerfilOperacional(tipo, autor);
    const operacao = OPERACOES[tipo];

    return db.transaction(async (trx) => {
      if (tipo === 'SVO') {
        await travarAgendaSvo(trx);
      }
      let viagem = await buscarParaAtualizar(trx, tipo, viagemId);
      await garantirAcessoAoRegistro(trx, autor, tipo, viagem);
      if (viagem.status !== operacao.agendada) {
        throw new AppError('Apenas viagens agendadas podem ser iniciadas', 400);
      }
      if (tipo === 'SVO') {
        await reavaliarFilaSvo(trx, autor.id);
        viagem = await buscarParaAtualizar(trx, tipo, viagemId);
      }
      if (tipo === 'SVO' && viagem.inicio_previsto && !viagem.liberada_em) {
        throw new AppError('Coleta ainda não liberada: verifique prioridade e disponibilidade dos recursos', 409);
      }

      // A saída só pode ser registrada com destino definido (BL18), independentemente da interface
      const solicitacao = await trx(operacao.tabelaSolicitacao)
        .where({ id: viagem.solicitacao_id })
        .first(operacao.colunaDestino);
      const destino = solicitacao?.[operacao.colunaDestino];
      if (typeof destino !== 'string' || destino.trim() === '') {
        throw new AppError('Informe o destino antes de registrar a saída do veículo', 400);
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

      // Foto da saída: confirmada na mesma transação, ou a transição não acontece
      const evidenciaSaida = await registrarEvidenciaNaTransicao(trx, {
        tipo, viagemId, viagem, fase: 'SAIDA', km: kmInicial, evidenciaId, autorId: autor.id,
      });

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

      await registrarAuditoria(trx, autor.id,
        `INICIOU_VIAGEM tipo=${tipo} id=${viagemId} km_inicial=${kmInicial}${evidenciaSaida ? ` evidencia=${evidenciaSaida}` : ''}`);

      if (tipo === 'ADMINISTRATIVA' && configNotificacoes.ativas) {
        const destinatarios = await buscarDestinatariosViagemAdministrativa(trx, viagemId);
        const avisos = montarAvisosAndamentoViagem(viagemId, 'INICIADA');

        await publicarNotificacao(
          trx,
          prepararEventoViagem(viagemId, avisos.gestor, autor.id, destinatarios.gestores)
        );

        const gestores = new Set(destinatarios.gestores);
        const solicitantes = destinatarios.solicitante.filter(id => !gestores.has(id));

        await publicarNotificacao(
          trx,
          prepararEventoViagem(viagemId, avisos.solicitante, autor.id, solicitantes)
        );
      }

      return detalhar(trx, tipo, viagemId);
    });
  },

  async finalizarViagem(tipo: TipoOperacao, viagemId: number, kmFinal: number, autor: Autor, evidenciaId?: number) {
    garantirPerfilOperacional(tipo, autor);
    const operacao = OPERACOES[tipo];

    return db.transaction(async (trx) => {
      if (tipo === 'SVO') await travarAgendaSvo(trx);
      const viagem = await buscarParaAtualizar(trx, tipo, viagemId);
      await garantirAcessoAoRegistro(trx, autor, tipo, viagem);
      const emAndamento = tipo === 'SVO' ? ordemSvoEmCurso(viagem.status) : viagem.status === operacao.emAndamento;
      if (!emAndamento) {
        throw new AppError('Apenas viagens em andamento podem ser finalizadas', 400);
      }

      // A quilometragem final é validada aqui, independentemente da interface (BL17)
      if (viagem.km_inicial === null || viagem.km_inicial === undefined) {
        throw new AppError('A viagem não possui km inicial registrado', 409);
      }
      if (kmFinal < viagem.km_inicial) {
        throw new AppError(`O km final não pode ser menor que o km inicial (${viagem.km_inicial})`, 400);
      }

      // Foto da chegada: confirmada na mesma transação, ou a transição não acontece
      const transicao = {
        tipo, viagemId, viagem, fase: 'CHEGADA' as const, km: kmFinal, evidenciaId, autorId: autor.id,
      };
      const evidenciaChegada = await registrarEvidenciaNaTransicao(trx, transicao);

      // Atualiza a viagem
      const agoraConclusao = new Date();
      await trx(operacao.tabela)
        .where({ id: viagemId })
        .update({
          status: 'CONCLUIDA',
          km_final: kmFinal,
          [operacao.colunaChegada]: agoraConclusao,
        });
      // Prazo de guarda das fotos (12 meses) conta da conclusão real
      const conclusao = await concluirOperacao(trx, transicao);

      // Atualiza km do veiculo sem reduzir o valor já registrado
      await trx('veiculos')
        .where({ id: viagem.veiculo_id })
        .update({ km_atual: trx.raw('GREATEST(km_atual, ?)', [kmFinal]) });

      // Veículo e motorista voltam para DISPONIVEL (ou RESERVADO/DESIGNADO, se houver outra viagem agendada)
      await sincronizarStatus(trx, viagem.veiculo_id, viagem.motorista_id);
      await atualizarSolicitacao(trx, tipo, viagem.solicitacao_id, operacao.solicitacaoConcluida);
      if (tipo === 'SVO') {
        const solSvo = await trx('solicitacoes_svo')
          .where({ id: viagem.solicitacao_id })
          .first('canal_origem');
        if (solSvo?.canal_origem === 'EXTERNA') {
          await acompanhamentoExternoSvoModel.registrarEncerramentoOperacional(
            viagem.solicitacao_id,
            agoraConclusao,
            trx
          );
        }
        await trx('alertas_atraso_svo').where({ ordem_em_atraso_id: viagemId })
          .whereNull('resolvido_em').update({ resolvido_em: trx.fn.now() });
        await reavaliarFilaSvo(trx, autor.id);
        // S7 (SCRUM-235): uma vez por deslocamento físico, quando a última ordem termina. Sem push
        if (conclusao) await notificacaoSvoService.publicarConclusaoColeta(conclusao, viagemId, autor.id, trx);
        else await notificacaoSvoService.avisarProximoPedidoDoDeslocamento(viagemId, 'CHEGADA', trx);
      }

      await registrarAuditoria(trx, autor.id,
        `FINALIZOU_VIAGEM tipo=${tipo} id=${viagemId} km_final=${kmFinal}${evidenciaChegada ? ` evidencia=${evidenciaChegada}` : ''}`);

      if (tipo === 'ADMINISTRATIVA' && configNotificacoes.ativas) {
        const destinatarios = await buscarDestinatariosViagemAdministrativa(trx, viagemId);
        const avisos = montarAvisosAndamentoViagem(viagemId, 'FINALIZADA');

        await publicarNotificacao(
          trx,
          prepararEventoViagem(viagemId, avisos.gestor, autor.id, destinatarios.gestores)
        );

        const gestores = new Set(destinatarios.gestores);
        const solicitantes = destinatarios.solicitante.filter(id => !gestores.has(id));

        await publicarNotificacao(
          trx,
          prepararEventoViagem(viagemId, avisos.solicitante, autor.id, solicitantes)
        );
      }

      return detalhar(trx, tipo, viagemId);
    });
  },

  // cancelarSolicitacao: também cancela a solicitação; sem ele, a solicitação pode ser atendida de novo
  async cancelarViagem(tipo: TipoOperacao, viagemId: number, autor: Autor, cancelarSolicitacao = false) {
    garantirAcesso(autor.perfil, tipo);
    const operacao = OPERACOES[tipo];

    return db.transaction(async (trx) => {
      if (tipo === 'SVO') await travarAgendaSvo(trx);
      const viagem = await buscarParaAtualizar(trx, tipo, viagemId);
      // Ordem SVO confirmada e ainda sem recursos (BL27) também pode ser cancelada,
      // senão a solicitação ficaria presa em CONFIRMADA
      const aguardandoAlocacao = tipo === 'SVO' && viagem.status === 'AGUARDANDO_ALOCACAO';
      if (viagem.status !== operacao.agendada && !aguardandoAlocacao) {
        throw new AppError(
          tipo === 'SVO'
            ? 'Apenas ordens aguardando alocação ou alocadas podem ser canceladas'
            : 'Apenas viagens agendadas podem ser canceladas',
          400
        );
      }

      // S5 (SCRUM-234): quem estava designado na ordem alocada (a aguardando alocação não tem ninguém)
      const equipeCancelada = tipo === 'SVO' && !aguardandoAlocacao ? await notificacaoSvoService.equipeParaAvisos(trx, viagemId) : null;
      await trx(operacao.tabela).where({ id: viagemId }).update({ status: 'CANCELADA' });
      if (equipeCancelada) await notificacaoSvoService.publicarCancelamento(equipeCancelada, autor.id, trx);

      // Libera veículo e motorista, se não houver outra viagem ativa.
      // A ordem aguardando alocação não tem recursos a liberar.
      if (!aguardandoAlocacao) {
        await sincronizarStatus(trx, viagem.veiculo_id, viagem.motorista_id);
      }
      await atualizarSolicitacao(
        trx,
        tipo,
        viagem.solicitacao_id,
        cancelarSolicitacao ? 'CANCELADA' : operacao.solicitacaoReaberta
      );
      if (tipo === 'SVO') {
        if (cancelarSolicitacao) {
          const solSvo = await trx('solicitacoes_svo')
            .where({ id: viagem.solicitacao_id })
            .first('canal_origem');
          if (solSvo?.canal_origem === 'EXTERNA') {
            await acompanhamentoExternoSvoModel.registrarEncerramentoOperacional(
              viagem.solicitacao_id,
              new Date(),
              trx
            );
          }
        }
        await trx('alertas_atraso_svo').where({ ordem_afetada_id: viagemId })
          .whereNull('resolvido_em').update({ resolvido_em: trx.fn.now() });
        await reavaliarFilaSvo(trx, autor.id);
      }

      await registrarAuditoria(
        trx,
        autor.id,
        `CANCELOU_VIAGEM tipo=${tipo} id=${viagemId}${cancelarSolicitacao ? ' solicitacao_cancelada' : ''}`
      );

      if (tipo === 'ADMINISTRATIVA' && configNotificacoes.ativas) {
        const destinatarios = await buscarDestinatariosViagemAdministrativa(trx, viagemId);
        const avisos = montarAvisosViagemCancelada(viagemId);

        await publicarNotificacao(
          trx,
          prepararEventoViagem(viagemId, avisos.motorista, autor.id, destinatarios.motorista)
        );

        const motoristas = new Set(destinatarios.motorista);
        const solicitantes = destinatarios.solicitante.filter(id => !motoristas.has(id));

        await publicarNotificacao(
          trx,
          prepararEventoViagem(viagemId, avisos.solicitante, autor.id, solicitantes)
        );
      }

      return detalhar(trx, tipo, viagemId);
    });
  },
};
