import type { Knex } from 'knex';
import { db } from '../config/database';
import { configNotificacoes } from '../config/notificacoes';
import { env } from '../config/env';
import { PERFIS, type Perfil } from '../constants/perfis';
import { ordemSvoEmCurso } from '../constants/statusOrdemSvo';
import { AppError } from '../errors/AppError';
import { MODULOS_AUDITORIA, auditoriaModel } from '../models/auditoriaModel';
import {
  chaveExcecao, excecoesDoRegistro, apresentarExcecao, type ExcecaoOdometroRow,
} from '../models/excecaoOdometroModel';
import type { TipoOperacao } from '../validators/viagemSchemas';
import { travarAgendaSvo } from './agendaSvoService';
import {
  montarAvisoExcecaoSolicitada,
  montarAvisoExcecaoDecidida,
  destinatariosExcecaoOdometro,
} from './eventosExcecaoOdometro';
import { publicarNotificacao } from './publicacaoNotificacoes';
import {
  deslocamentoDaOrdem, deslocamentoEmCursoDoVeiculo, evidenciaDaFase, type FaseOdometro,
} from './evidenciaOdometroTransicao';
import { buscarParaAtualizar, garantirAcesso, garantirAcessoAoRegistro, OPERACOES } from './viagemService';

type Autor = { id: number; perfil: Perfil };
type Registro = Awaited<ReturnType<typeof buscarParaAtualizar>>;
type Referencia = { tipo_operacao: TipoOperacao; viagem_id: number; fase: FaseOdometro };

function exigirRecurso() {
  if (!env.excecoesOdometroAtivas) {
    throw new AppError('O pedido de autorização sem foto está indisponível neste ambiente.', 503);
  }
}

async function garantirFaseAberta(trx: Knex.Transaction, ref: Referencia, viagem: Registro) {
  const { tipo_operacao: tipo, fase, viagem_id: id } = ref;
  const operacao = OPERACOES[tipo];
  const valida = fase === 'SAIDA'
    ? viagem.status === operacao.agendada
    : tipo === 'SVO' ? ordemSvoEmCurso(viagem.status) : viagem.status === operacao.emAndamento;
  if (!valida) throw new AppError('A fase informada já foi encerrada ou ainda não está disponível.', 409);

  let alvo: number | undefined = id;
  if (tipo === 'SVO') {
    const deslocamento = fase === 'SAIDA'
      ? await deslocamentoEmCursoDoVeiculo(trx, viagem.veiculo_id)
      : await deslocamentoDaOrdem(trx, id);
    alvo = deslocamento?.motorista_id === viagem.motorista_id ? deslocamento?.id : undefined;
  }
  if (alvo !== undefined && await evidenciaDaFase(trx, tipo, alvo, fase)) {
    throw new AppError('Esta fase já tem comprovação de odômetro.', 409);
  }
}

export const excecaoOdometroService = {
  async solicitar(dados: Referencia & { motivo: string }, autor: Autor) {
    exigirRecurso();
    const { tipo_operacao: tipo, viagem_id: id, fase, motivo } = dados;
    const perfilEsperado = tipo === 'SVO' ? PERFIS.MOTORISTA_SVO : PERFIS.MOTORISTA_FROTA;
    if (autor.perfil !== perfilEsperado) throw new AppError('Apenas o motorista designado pode solicitar autorização.', 403);
    return db.transaction(async (trx) => {
      if (tipo === 'SVO') await travarAgendaSvo(trx);
      const viagem = await buscarParaAtualizar(trx, tipo, id);
      await garantirAcessoAoRegistro(trx, autor, tipo, viagem);
      await garantirFaseAberta(trx, dados, viagem);

      const existente = await excecoesDoRegistro(trx, tipo, id)
        .where({ fase }).whereNull('encerrada_em').whereIn('status', ['PENDENTE', 'APROVADA']).first();
      if (existente) {
        if (existente.solicitada_por !== autor.id) throw new AppError('O vínculo do motorista mudou. Consulte a gestão.', 409);
        return apresentarExcecao(existente);
      }

      const [registro] = await trx<ExcecaoOdometroRow>('excecoes_odometro').insert({
        ...chaveExcecao(tipo, id), fase, motivo, solicitada_por: autor.id,
        motorista_id: viagem.motorista_id, veiculo_id: viagem.veiculo_id,
      }).returning('*');
      await auditoriaModel.registrar({
        usuario_id: autor.id, modulo: MODULOS_AUDITORIA.VIAGENS,
        acao: `SOLICITOU_EXCECAO_ODOMETRO tipo=${tipo} id=${id} fase=${fase} excecao=${registro!.id}`,
      }, trx);
      if (tipo === 'ADMINISTRATIVA' && configNotificacoes.ativas) {
        await publicarNotificacao(trx, {
          ...montarAvisoExcecaoSolicitada(registro!.id, fase),
          operacao: 'Administrativo',
          severidade: 'warning',
          referencia: { tipo: 'VIAGEM_FROTA', id },
          autorId: autor.id,
          destinatarios: await destinatariosExcecaoOdometro(trx),
        });
      }

      return apresentarExcecao(registro!);
    });
  },

  async listarPendentes(tipo: TipoOperacao, pagina: number, autor: Autor) {
    exigirRecurso();
    garantirAcesso(autor.perfil, tipo);
    const limite = 20;
    const filas = await db<ExcecaoOdometroRow>('excecoes_odometro as e')
      .join('usuarios as u', 'u.id', 'e.solicitada_por')
      .where({ 'e.tipo_operacao': tipo, 'e.status': 'PENDENTE' }).whereNull('e.encerrada_em')
      .select<Array<ExcecaoOdometroRow & { motorista_nome: string }>>('e.*', 'u.nome as motorista_nome')
      .orderBy('e.id').offset((pagina - 1) * limite).limit(limite + 1);
    return {
      dados: filas.slice(0, limite).map((fila) => ({ ...apresentarExcecao(fila), motorista_nome: fila.motorista_nome })),
      tem_mais: filas.length > limite,
    };
  },

  async decidir(
    id: number, tipo: TipoOperacao, decisao: 'APROVADA' | 'RECUSADA', justificativa: string, autor: Autor,
  ) {
    exigirRecurso();
    garantirAcesso(autor.perfil, tipo);
    return db.transaction(async (trx) => {
      if (tipo === 'SVO') await travarAgendaSvo(trx);
      const alvo = await trx<ExcecaoOdometroRow>('excecoes_odometro').where({ id, tipo_operacao: tipo }).first();
      if (!alvo) throw new AppError('Pedido de autorização não encontrado.', 404);
      const viagemId = (alvo.viagem_frota_id ?? alvo.ordem_svo_id)!;
      // Mesma ordem de locks da transição e dos gatilhos de encerramento.
      const viagem = await buscarParaAtualizar(trx, tipo, viagemId);
      const registro = await excecoesDoRegistro(trx, tipo, viagemId).where({ id }).forUpdate().first();
      if (!registro || registro.status !== 'PENDENTE' || registro.encerrada_em) {
        throw new AppError('Este pedido já foi decidido ou perdeu a validade.', 409);
      }
      const motorista = await trx('motoristas').where({ id: viagem.motorista_id }).first('usuario_id');
      if (autor.id === registro.solicitada_por || autor.id === motorista?.usuario_id) {
        throw new AppError('O próprio motorista não pode decidir o pedido.', 403);
      }
      if (viagem.motorista_id !== registro.motorista_id || viagem.veiculo_id !== registro.veiculo_id ||
          motorista?.usuario_id !== registro.solicitada_por) {
        throw new AppError('A designação mudou. Solicite uma nova autorização.', 409);
      }
      await garantirFaseAberta(trx, { tipo_operacao: tipo, viagem_id: viagemId, fase: registro.fase }, viagem);
      const [auditoria] = await trx('auditorias').insert({
        usuario_id: autor.id, modulo: MODULOS_AUDITORIA.VIAGENS,
        acao: `DECIDIU_EXCECAO_ODOMETRO tipo=${tipo} id=${viagemId} fase=${registro.fase} excecao=${id} decisao=${decisao}`,
      }).returning<{ id: number }[]>('id');
      const [atual] = await excecoesDoRegistro(trx, tipo, viagemId).where({ id }).update({
        status: decisao, justificativa, decidida_por: autor.id, decidida_em: trx.fn.now(),
        auditoria_decisao_id: auditoria!.id,
      }).returning('*');
      if (tipo === 'ADMINISTRATIVA' && configNotificacoes.ativas &&
          await trx('usuarios').where({ id: registro.solicitada_por, perfil: PERFIS.MOTORISTA_FROTA, ativo: true }).first('id')) {
        await publicarNotificacao(trx, {
          ...montarAvisoExcecaoDecidida(registro.id, decisao, registro.fase, justificativa),
          operacao: 'Administrativo',
          severidade: decisao === 'APROVADA' ? 'success' : 'warning',
          referencia: { tipo: 'VIAGEM_FROTA', id: viagemId },
          autorId: autor.id,
          destinatarios: [registro.solicitada_por],
        });
      }

      return apresentarExcecao(atual!);
    });
  },
};
