import { db } from '../config/database';
import { cnhVencida } from '../constants/cnh';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  motoristaModel,
  type AlteracoesCnh,
  type MotoristaComNome,
  type MotoristaResumo,
  type TipoMotorista,
  type UsuarioElegivel,
} from '../models/motoristaModel';
import type { AtualizarMotoristaInput, CriarMotoristaInput, ListarMotoristasFiltros } from '../validators/motoristaSchemas';

export interface AutorMotorista {
  id: number;
  perfil: Perfil;
}

/** DTO do fluxo de edição: o único que carrega o número integral da CNH. */
export interface MotoristaDetalhe extends MotoristaComNome {
  cnh_vencida: boolean;
}

// Mensagens genéricas: não revelam quem é o titular do registro em conflito.
const cnhDuplicada = () => new AppError('Já existe um motorista cadastrado com esta CNH', 409, 'CNH_DUPLICADA');
const usuarioJaMotorista = () => new AppError('Este usuário já possui cadastro de motorista', 409, 'MOTORISTA_JA_CADASTRADO');
const SEM_COMPETENCIA = 'Você não tem permissão para gerenciar motoristas desta operação';

const INDICES_CNH = ['uq_motoristas_numero_cnh_canonico', 'motoristas_numero_cnh_unique'];
const INDICE_USUARIO = 'uq_motoristas_usuario_id';

const TIPO_DO_PERFIL: Partial<Record<Perfil, TipoMotorista>> = {
  [PERFIS.MOTORISTA_FROTA]: 'FROTA',
  [PERFIS.MOTORISTA_SVO]: 'SVO',
};

/**
 * Tipos de motorista que cada perfil gerencia (regra 6 da matriz): Administrador nos dois, Gestor de
 * Frota no FROTA e Gestor SVO no SVO. A associação do Gestor SVO à unidade é checada na rota.
 */
export function tiposGerenciaveis(perfil: Perfil): TipoMotorista[] {
  if (perfil === PERFIS.ADMINISTRADOR) return ['FROTA', 'SVO'];
  if (perfil === PERFIS.GESTOR_FROTA) return ['FROTA'];
  if (perfil === PERFIS.GESTOR_SVO) return ['SVO'];
  return [];
}

function exigirCompetencia(autor: AutorMotorista, tipo: TipoMotorista): void {
  if (!tiposGerenciaveis(autor.perfil).includes(tipo)) throw new AppError(SEM_COMPETENCIA, 403);
}

/** Converte a violação de unicidade do banco (corrida que passou da pré-checagem) em 409. */
function traduzirConflito(erro: unknown): never {
  if (erro && typeof erro === 'object' && 'code' in erro && erro.code === '23505') {
    const restricao = 'constraint' in erro ? String(erro.constraint) : '';
    if (restricao === INDICE_USUARIO) throw usuarioJaMotorista();
    if (INDICES_CNH.includes(restricao)) throw cnhDuplicada();
  }
  throw erro;
}

async function detalhar(id: number): Promise<MotoristaDetalhe> {
  const motorista = await motoristaModel.buscarDetalhe(id);
  if (!motorista) throw new AppError('Motorista não encontrado', 404);
  return { ...motorista, cnh_vencida: cnhVencida(motorista.validade_cnh) };
}

export const motoristaService = {
  async listar(filtros: ListarMotoristasFiltros): Promise<MotoristaResumo[]> {
    return motoristaModel.listar(filtros);
  },

  async buscarPorUsuarioId(usuarioId: number): Promise<MotoristaComNome | undefined> {
    return motoristaModel.buscarPorUsuarioId(usuarioId);
  },

  async listarUsuariosElegiveis(autor: AutorMotorista): Promise<UsuarioElegivel[]> {
    return motoristaModel.listarUsuariosElegiveis(tiposGerenciaveis(autor.perfil));
  },

  async buscarDetalhe(id: number, autor: AutorMotorista): Promise<MotoristaDetalhe> {
    const motorista = await detalhar(id);
    exigirCompetencia(autor, motorista.tipo_motorista);
    return motorista;
  },

  async criar(dados: CriarMotoristaInput, autor: AutorMotorista): Promise<MotoristaDetalhe> {
    let id: number;
    try {
      id = await db.transaction(async (trx) => {
        const usuario = await motoristaModel.travarUsuario(dados.usuario_id, trx);
        const tipo = usuario ? TIPO_DO_PERFIL[usuario.perfil as Perfil] : undefined;
        if (!usuario || !usuario.ativo || !tipo) {
          throw new AppError('Selecione um usuário ativo com perfil de motorista', 422, 'USUARIO_NAO_ELEGIVEL');
        }
        exigirCompetencia(autor, tipo);
        if (await motoristaModel.existeParaUsuario(usuario.id, trx)) throw usuarioJaMotorista();

        await motoristaModel.travarNumeroCnh(dados.numero_cnh, trx);
        if (await motoristaModel.existeCnhCanonica(dados.numero_cnh, trx)) throw cnhDuplicada();

        const novoId = await motoristaModel.criar(
          {
            usuario_id: usuario.id,
            numero_cnh: dados.numero_cnh,
            categoria_cnh: dados.categoria_cnh,
            validade_cnh: dados.validade_cnh,
            tipo_motorista: tipo,
          },
          trx
        );
        // O número da CNH nunca entra na auditoria.
        await auditoriaModel.registrar(
          { usuario_id: autor.id, acao: `CADASTROU_MOTORISTA id=${novoId} usuario_id=${usuario.id}`, modulo: MODULOS_AUDITORIA.MOTORISTAS },
          trx
        );
        return novoId;
      });
    } catch (erro) {
      traduzirConflito(erro);
    }
    return detalhar(id);
  },

  async atualizar(id: number, dados: AtualizarMotoristaInput, autor: AutorMotorista): Promise<MotoristaDetalhe> {
    // Só os campos enviados são alterados; os omitidos ficam como estão.
    const alteracoes: AlteracoesCnh = {};
    if (dados.numero_cnh !== undefined) alteracoes.numero_cnh = dados.numero_cnh;
    if (dados.categoria_cnh !== undefined) alteracoes.categoria_cnh = dados.categoria_cnh;
    if (dados.validade_cnh !== undefined) alteracoes.validade_cnh = dados.validade_cnh;

    try {
      await db.transaction(async (trx) => {
        const atual = await motoristaModel.buscarParaAtualizar(id, trx);
        if (!atual) throw new AppError('Motorista não encontrado', 404);
        exigirCompetencia(autor, atual.tipo_motorista);

        if (alteracoes.numero_cnh !== undefined) {
          await motoristaModel.travarNumeroCnh(alteracoes.numero_cnh, trx);
          if (await motoristaModel.existeCnhCanonica(alteracoes.numero_cnh, trx, id)) throw cnhDuplicada();
        }

        await motoristaModel.atualizarCnh(id, alteracoes, trx);
        await auditoriaModel.registrar(
          { usuario_id: autor.id, acao: `ATUALIZOU_MOTORISTA id=${id} campos=${Object.keys(alteracoes).join(',')}`, modulo: MODULOS_AUDITORIA.MOTORISTAS },
          trx
        );
      });
    } catch (erro) {
      traduzirConflito(erro);
    }
    return detalhar(id);
  },
};
