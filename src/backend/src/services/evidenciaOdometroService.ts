import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { env } from '../config/env';
import { db } from '../config/database';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { viagemModel } from '../models/viagemModel';
import type { TipoOperacao } from '../validators/viagemSchemas';
import { armazenamentoEvidencias, lerEvidenciaVerificada } from './armazenamentoEvidencias';
import { chaveR2Evidencia } from './chavesEvidencias';
import { normalizarFotoOdometro, type FormatoFoto } from './imagemEvidencias';
import {
  deslocamentoDaOrdem,
  deslocamentoEmCursoDoVeiculo,
  evidenciaDaFase,
  expiraEm,
  STATUS_DA_FASE,
  type EvidenciaOdometroRow,
  type FaseOdometro,
} from './evidenciaOdometroTransicao';
import {
  buscarParaAtualizar,
  garantirAcesso,
  garantirAcessoAoRegistro,
  OPERACOES,
} from './viagemService';

/** Fotos do odômetro: envio (SCRUM-208), consulta e arquivo (SCRUM-209). */

interface Autor {
  id: number;
  perfil: Perfil;
}

const EXTENSOES: Record<FormatoFoto, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PERFIS_GESTORES: Perfil[] = [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO];
const ehGestor = (perfil: Perfil) => PERFIS_GESTORES.includes(perfil);

function idDaViagem(evidencia: Pick<EvidenciaOdometroRow, 'tipo_operacao' | 'viagem_frota_id' | 'ordem_svo_id'>) {
  return evidencia.tipo_operacao === 'ADMINISTRATIVA' ? evidencia.viagem_frota_id : evidencia.ordem_svo_id;
}

async function registrarAuditoria(conexao: Knex | Knex.Transaction, autorId: number, acao: string) {
  await auditoriaModel.registrar({ usuario_id: autorId, acao, modulo: MODULOS_AUDITORIA.VIAGENS }, conexao as Knex);
}

// ---------- Envio (POST /evidencias-odometro) ----------

export interface EnvioFoto {
  tipo_operacao: TipoOperacao;
  viagem_id: number;
  fase: FaseOdometro;
  chave_idempotencia: string;
}

export interface EvidenciaEnviada {
  id: string;
  fase: FaseOdometro;
  expira_em: string;
}

const respostaEnvio = (evidencia: Pick<EvidenciaOdometroRow, 'id' | 'fase' | 'criado_em'>): EvidenciaEnviada => ({
  id: String(evidencia.id),
  fase: evidencia.fase,
  expira_em: expiraEm(evidencia.criado_em).toISOString(),
});

async function criarProvisoria(
  trx: Knex.Transaction,
  dados: EnvioFoto,
  autor: Autor,
  arquivo: { storageKey: string; formato: FormatoFoto; tamanho: number; sha256: string }
) {
  const tipo = dados.tipo_operacao;
  const operacao = OPERACOES[tipo];
  const viagem = await buscarParaAtualizar(trx, tipo, dados.viagem_id);
  await garantirAcessoAoRegistro(trx, autor, tipo, viagem);

  const statusEsperado = dados.fase === 'SAIDA' ? operacao.agendada : operacao.emAndamento;
  const noLocal = dados.tipo_operacao === 'SVO' && dados.fase === 'CHEGADA' && viagem.status === 'NO_LOCAL';
  if (viagem.status !== statusEsperado && !noLocal) {
    throw new AppError(
      dados.fase === 'SAIDA'
        ? 'A foto de saída só pode ser enviada para viagens agendadas'
        : 'A foto de chegada só pode ser enviada para viagens em andamento',
      409
    );
  }

  // A fase já coberta não recebe outra foto (inclusive no deslocamento SVO compartilhado)
  let deslocamentoId: number | null = null;
  let alvoId: number | undefined = dados.viagem_id;
  if (tipo === 'SVO') {
    const deslocamento = dados.fase === 'SAIDA'
      ? await deslocamentoEmCursoDoVeiculo(trx, viagem.veiculo_id)
      : await deslocamentoDaOrdem(trx, dados.viagem_id);
    alvoId = deslocamento?.id;
    // Na chegada, a foto já nasce ligada ao deslocamento da ordem
    if (dados.fase === 'CHEGADA') deslocamentoId = deslocamento?.id ?? null;
  }
  if (alvoId !== undefined && (await evidenciaDaFase(trx, tipo, alvoId, dados.fase))) {
    throw new AppError(`A foto do odômetro na ${dados.fase === 'SAIDA' ? 'saída' : 'chegada'} já foi registrada`, 409);
  }

  const motorista = await trx('motoristas').where({ id: viagem.motorista_id }).first('usuario_id');
  if (!motorista?.usuario_id) {
    throw new AppError('O motorista desta viagem não tem usuário vinculado', 409);
  }
  // km provisório: o definitivo é gravado na confirmação, com o km informado na transição
  const veiculo = await trx('veiculos').where({ id: viagem.veiculo_id }).first('km_atual');
  const kmProvisorio = dados.fase === 'SAIDA' ? veiculo?.km_atual ?? 0 : viagem.km_inicial ?? veiculo?.km_atual ?? 0;

  const [evidencia] = await trx('evidencias_odometro')
    .insert({
      tipo_operacao: tipo,
      fase: dados.fase,
      viagem_frota_id: tipo === 'ADMINISTRATIVA' ? dados.viagem_id : null,
      deslocamento_svo_id: deslocamentoId,
      ordem_svo_id: tipo === 'SVO' ? dados.viagem_id : null,
      veiculo_id: viagem.veiculo_id,
      motorista_id: viagem.motorista_id,
      motorista_usuario_id: motorista.usuario_id,
      km_registrado: kmProvisorio,
      modalidade: 'FOTO',
      status: 'STAGING',
      storage_key: arquivo.storageKey,
      mime_type: arquivo.formato,
      tamanho_bytes: arquivo.tamanho,
      sha256: arquivo.sha256,
      registrado_por: autor.id,
    })
    .returning<EvidenciaOdometroRow[]>('*');
  return evidencia!;
}

// ---------- Consulta (GET /evidencias-odometro) ----------

export type SituacaoEvidencia = 'PENDENTE' | 'REGISTRADA' | 'EXCECAO_AUTORIZADA' | 'EXPIRADA' | 'SEM_REGISTRO';

export interface EvidenciaDaFase {
  id: string | null;
  fase: FaseOdometro;
  situacao: SituacaoEvidencia;
  km: number | null;
  registrada_em: string | null;
  autor_nome: string | null;
  compartilhada: boolean;
  excecao: { justificativa: string; autorizada_por_nome: string | null; autorizada_em: string } | null;
  pode_baixar: boolean;
}

type EvidenciaComNomes = EvidenciaOdometroRow & { autor_nome: string | null; aprovador_nome: string | null };

async function evidenciasComNomes(tipo: TipoOperacao, alvoId: number): Promise<EvidenciaComNomes[]> {
  return db('evidencias_odometro as e')
    .leftJoin('usuarios as autor', 'autor.id', 'e.registrado_por')
    .leftJoin('usuarios as aprovador', 'aprovador.id', 'e.excecao_aprovada_por')
    .where('e.tipo_operacao', tipo)
    .where(tipo === 'ADMINISTRATIVA' ? 'e.viagem_frota_id' : 'e.deslocamento_svo_id', alvoId)
    .whereIn('e.status', STATUS_DA_FASE)
    .select('e.*', 'autor.nome as autor_nome', 'aprovador.nome as aprovador_nome');
}

function montarFase(
  fase: FaseOdometro,
  evidencia: EvidenciaComNomes | undefined,
  faseOcorreu: boolean,
  contexto: { tipo: TipoOperacao; viagemId: number; gestor: boolean }
): EvidenciaDaFase {
  if (!evidencia) {
    return {
      id: null, fase, situacao: faseOcorreu ? 'SEM_REGISTRO' : 'PENDENTE', km: null, registrada_em: null,
      autor_nome: null, compartilhada: false, excecao: null, pode_baixar: false,
    };
  }
  const excecao = evidencia.modalidade === 'EXCECAO_GESTOR';
  const situacao: SituacaoEvidencia = evidencia.status === 'EXPURGADA_RETENCAO'
    ? 'EXPIRADA'
    : excecao ? 'EXCECAO_AUTORIZADA' : 'REGISTRADA';
  return {
    id: String(evidencia.id),
    fase,
    situacao,
    km: evidencia.km_registrado,
    registrada_em: new Date(evidencia.criado_em).toISOString(),
    autor_nome: evidencia.autor_nome,
    compartilhada: contexto.tipo === 'SVO' && evidencia.ordem_svo_id !== contexto.viagemId,
    excecao: excecao
      ? {
          justificativa: evidencia.excecao_justificativa ?? '',
          autorizada_por_nome: evidencia.aprovador_nome,
          autorizada_em: new Date(evidencia.excecao_aprovada_em!).toISOString(),
        }
      : null,
    pode_baixar: contexto.gestor && situacao === 'REGISTRADA',
  };
}

// Quem consulta: gestores pela operação (Administrador as duas, Gestor de Frota só a administrativa,
// Gestor SVO só o SVO); motoristas só a própria viagem, sem acesso ao arquivo. Demais: 403.
async function garantirConsulta(autor: Autor, tipo: TipoOperacao, viagemId: number) {
  if (ehGestor(autor.perfil)) {
    garantirAcesso(autor.perfil, tipo);
    return;
  }
  if (autor.perfil !== PERFIS.MOTORISTA_FROTA && autor.perfil !== PERFIS.MOTORISTA_SVO) {
    throw new AppError('Você não tem permissão para ver as fotos do odômetro', 403);
  }
  const viagem = await db(OPERACOES[tipo].tabela).where({ id: viagemId }).first('motorista_id');
  if (!viagem) throw new AppError('Viagem não encontrada', 404);
  await db.transaction((trx) => garantirAcessoAoRegistro(trx, autor, tipo, viagem));
}

export const evidenciaOdometroService = {
  async enviar(dados: EnvioFoto, conteudo: Buffer, autor: Autor): Promise<EvidenciaEnviada> {
    const { formato, bytes } = await normalizarFotoOdometro(conteudo);
    const idempotencia = dados.chave_idempotencia.toLowerCase();
    const chaveLegada = `odometro/${autor.id}/${idempotencia}`;
    const storageKey = env.evidenciasR2
      ? chaveR2Evidencia(autor.id, idempotencia, env.evidenciasR2.segredoIdempotencia)
      : chaveLegada;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // Persiste a reserva antes de gravar os bytes. Um PUT sem resposta ainda tem
    // referência para retry e para a limpeza, mesmo se a conexão cair.
    const reserva = await db.transaction(async (trx) => {
      await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [storageKey]);
      const anterior = await trx<EvidenciaOdometroRow>('evidencias_odometro')
        .whereIn('storage_key', [storageKey, chaveLegada]).orderBy('id').first();
      return anterior ?? criarProvisoria(trx, dados, autor, { storageKey, formato, tamanho: bytes.length, sha256 });
    });
    const armazenamento = armazenamentoEvidencias();
    return db.transaction(async (trx) => {
      const evidencia = await trx<EvidenciaOdometroRow>('evidencias_odometro')
        .where({ id: reserva.id }).forUpdate().first();
      if (!evidencia || evidencia.registrado_por !== autor.id || evidencia.tipo_operacao !== dados.tipo_operacao ||
        evidencia.fase !== dados.fase || idDaViagem(evidencia) !== dados.viagem_id) {
        throw new AppError('Esta chave de envio já foi usada para outra foto. Gere uma nova chave.', 409);
      }
      if (evidencia.status !== 'ATIVA' &&
        (evidencia.status !== 'STAGING' || expiraEm(evidencia.criado_em).getTime() <= Date.now())) {
        throw new AppError('A foto enviada expirou. Envie a foto com uma nova chave.', 409);
      }
      const legadoSemNormalizacao = evidencia.auditoria_id === null && evidencia.storage_key === chaveLegada &&
        evidencia.sha256 === createHash('sha256').update(conteudo).digest('hex') && evidencia.sha256 !== sha256;
      if (!legadoSemNormalizacao && evidencia.sha256 !== sha256) {
        throw new AppError('Esta chave de envio já foi usada para outra foto. Gere uma nova chave.', 409);
      }
      if (evidencia.status === 'ATIVA' || evidencia.auditoria_id !== null) return respostaEnvio(evidencia);
      if (!evidencia.storage_key) throw new AppError('Reserva de evidência inválida', 502);
      if (env.evidenciasR2 && evidencia.storage_key === chaveLegada) {
        // A migração de arquivos locais é separada. Uma requisição não recria a chave legada no R2.
        await lerEvidenciaVerificada(chaveLegada, evidencia.tamanho_bytes!, evidencia.sha256!);
      } else {
        await armazenamento.salvar(evidencia.storage_key, legadoSemNormalizacao ? conteudo : bytes, formato);
      }
      const [auditoria] = await trx('auditorias').insert({
        usuario_id: autor.id,
        modulo: MODULOS_AUDITORIA.VIAGENS,
        acao: `ENVIOU_FOTO_ODOMETRO tipo=${dados.tipo_operacao} id=${dados.viagem_id} fase=${dados.fase} evidencia=${evidencia.id}`,
      }).returning<{ id: number }[]>('id');
      await trx('evidencias_odometro').where({ id: evidencia.id }).update({ auditoria_id: auditoria!.id });
      return respostaEnvio(evidencia);
    });
  },

  async consultar(tipo: TipoOperacao, viagemId: number, autor: Autor) {
    await garantirConsulta(autor, tipo, viagemId);
    const viagem = await viagemModel.buscarPorId(tipo, viagemId);
    if (!viagem) throw new AppError('Viagem não encontrada', 404);

    // Status da consulta unificada: a ordem SVO aparece como AGENDADA / EM_ANDAMENTO / CONCLUIDA
    const saiu = ['EM_ANDAMENTO', 'NO_LOCAL', 'CONCLUIDA'].includes(viagem.status);
    const chegou = viagem.status === 'CONCLUIDA';

    let evidencias: EvidenciaComNomes[] = [];
    if (tipo === 'ADMINISTRATIVA') {
      evidencias = await evidenciasComNomes(tipo, viagemId);
    } else {
      // Coleta ainda não iniciada num veículo já em deslocamento: a saída vem do deslocamento em curso
      const deslocamento = (await deslocamentoDaOrdem(db, viagemId)) ??
        (viagem.status === 'AGENDADA'
          ? await deslocamentoEmCursoDoVeiculo(db, viagem.veiculo_id).then((d) =>
              d && d.motorista_id === viagem.motorista_id ? d : undefined)
          : undefined);
      if (deslocamento) evidencias = await evidenciasComNomes(tipo, deslocamento.id);
    }

    const contexto = { tipo, viagemId, gestor: ehGestor(autor.perfil) };
    if (contexto.gestor) {
      await registrarAuditoria(db, autor.id, `CONSULTOU_FOTOS_ODOMETRO tipo=${tipo} id=${viagemId}`);
    }
    return {
      tipo_operacao: tipo,
      viagem_id: viagemId,
      veiculo_placa: viagem.veiculo_placa ?? null,
      motorista_nome: viagem.motorista_nome ?? null,
      saida: montarFase('SAIDA', evidencias.find((e) => e.fase === 'SAIDA'), saiu, contexto),
      chegada: montarFase('CHEGADA', evidencias.find((e) => e.fase === 'CHEGADA'), chegou, contexto),
    };
  },

  async arquivo(evidenciaId: number, autor: Autor, baixar: boolean) {
    const evidencia = await db<EvidenciaOdometroRow>('evidencias_odometro').where({ id: evidenciaId }).first();
    if (!evidencia) throw new AppError('Foto não encontrada', 404);
    if (!ehGestor(autor.perfil)) throw new AppError('Você não tem permissão para ver as fotos do odômetro', 403);
    garantirAcesso(autor.perfil, evidencia.tipo_operacao);
    // Provisórias, rejeitadas, exceções e expurgadas não têm arquivo para mostrar
    if (evidencia.modalidade !== 'FOTO' || evidencia.status !== 'ATIVA' || !evidencia.storage_key ||
      !evidencia.mime_type || !evidencia.sha256 || !evidencia.tamanho_bytes) {
      throw new AppError('Foto não disponível', 404);
    }
    const conteudo = await lerEvidenciaVerificada(evidencia.storage_key, evidencia.tamanho_bytes, evidencia.sha256);
    const viagemId = idDaViagem(evidencia);
    if (baixar) {
      await registrarAuditoria(db, autor.id,
        `BAIXOU_FOTO_ODOMETRO tipo=${evidencia.tipo_operacao} id=${viagemId} fase=${evidencia.fase} evidencia=${evidencia.id}`);
    }
    const formato = evidencia.mime_type as FormatoFoto;
    return {
      conteudo,
      mimeType: formato,
      nomeArquivo: `odometro-${evidencia.tipo_operacao.toLowerCase()}-${viagemId}-${evidencia.fase.toLowerCase()}.${EXTENSOES[formato]}`,
    };
  },
};
