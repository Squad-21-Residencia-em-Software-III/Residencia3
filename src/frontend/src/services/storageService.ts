import type { Usuario, NovoUsuarioInput, AtualizarUsuarioInput } from '../types/usuario';
import { MOCK_USUARIOS } from './mocks/usuariosMock';
import { tipoUsuarioDoPerfil } from '../types/usuario';
import type { Veiculo } from '../types/veiculo';
import { MOCK_VEICULOS } from './mocks/veiculosMock';
import type { Motorista } from '../types/motorista';
import { MOCK_MOTORISTAS } from './mocks/motoristasMock';
import type { Viagem } from '../types/viagem';
import { MOCK_VIAGENS } from './mocks/viagensMock';
import type { Abastecimento, NovoAbastecimentoInput } from '../types/abastecimento';
import { MOCK_ABASTECIMENTOS } from './mocks/abastecimentosMock';
import type { Multa, NovaMultaInput, AtualizarMultaInput } from '../types/multa';
import { MOCK_MULTAS } from './mocks/multasMock';
import type { Manutencao, NovaManutencaoInput, StatusManutencao } from '../types/manutencao';
import { MOCK_MANUTENCOES } from './mocks/manutencoesMock';
import type { SolicitacaoViagem, NovaSolicitacaoInput } from '../types/solicitacao';
import { MOCK_SOLICITACOES } from './mocks/solicitacoesMock';
import type { ExcecaoAgenda, RotaAgenda } from '../types/agenda';
import {
  MOCK_AGENDA_HOJE,
  MOCK_AGENDA_SEMANA,
  MOCK_EXCECOES_MES,
  MOCK_HISTORICO_MES,
} from './mocks/agendaMock';

const STORAGE_KEY_USUARIOS = '@fsph:usuarios';
const STORAGE_KEY_VEICULOS = '@fsph:veiculos';
const STORAGE_KEY_MOTORISTAS = '@fsph:motoristas';
const STORAGE_KEY_VIAGENS = '@fsph:viagens';
const STORAGE_KEY_ABASTECIMENTOS = '@fsph:abastecimentos';
const STORAGE_KEY_MULTAS = '@fsph:multas';
const STORAGE_KEY_MANUTENCOES = '@fsph:manutencoes';
const STORAGE_KEY_SOLICITACOES = '@fsph:solicitacoes';
const STORAGE_KEY_AGENDA = '@fsph:agenda';

/** Estrutura da agenda operacional mantida no cache. */
export interface AgendaCache {
  hoje: RotaAgenda[];
  semana: RotaAgenda[];
  excecoesMes: Record<number, ExcecaoAgenda[]>;
  historicoMes: Record<number, number>;
}

/**
 * Serviço de persistência local para a aplicação.
 * Implementa o cache solicitado para que a interface reflita mudanças
 * imediatamente e persista após o recarregamento da página (F5).
 */
export const storageService = {
  // --- GESTÃO DE USUÁRIOS ---
  getUsuarios: (): Usuario[] => {
    const stored = localStorage.getItem(STORAGE_KEY_USUARIOS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_USUARIOS, JSON.stringify(MOCK_USUARIOS));
      return MOCK_USUARIOS;
    }
    return JSON.parse(stored);
  },

  saveTodosUsuarios: (usuarios: Usuario[]): void => {
    localStorage.setItem(STORAGE_KEY_USUARIOS, JSON.stringify(usuarios));
  },

  createUsuario: (input: NovoUsuarioInput): Usuario => {
    const usuarios = storageService.getUsuarios();
    const emailExiste = usuarios.some(u => u.email.toLowerCase() === input.email.toLowerCase());
    if (emailExiste) {
      throw new Error('Este e-mail já está cadastrado no sistema.');
    }

    const novoUsuario: Usuario = {
      id: usuarios.length > 0 ? Math.max(...usuarios.map(u => u.id)) + 1 : 1,
      nome: input.nome,
      email: input.email.toLowerCase(),
      perfil: input.perfil,
      tipo_usuario: tipoUsuarioDoPerfil(input.perfil),
      ativo: true,
    };

    const usuariosAtualizados = [novoUsuario, ...usuarios];
    storageService.saveTodosUsuarios(usuariosAtualizados);
    return novoUsuario;
  },

  updateUsuario: (id: number, input: AtualizarUsuarioInput): Usuario => {
    const usuarios = storageService.getUsuarios();
    const index = usuarios.findIndex(u => u.id === id);
    if (index === -1) throw new Error('Usuário não encontrado.');

    const usuarioAtualizado = {
      ...usuarios[index],
      ...input,
      ...(input.perfil ? { tipo_usuario: tipoUsuarioDoPerfil(input.perfil) } : {}),
    };

    usuarios[index] = usuarioAtualizado;
    storageService.saveTodosUsuarios(usuarios);
    return usuarioAtualizado;
  },

  toggleStatusUsuario: (id: number, status: boolean): Usuario => {
    return storageService.updateUsuario(id, { ativo: status });
  },

  deleteUsuario: (id: number): void => {
    const usuarios = storageService.getUsuarios().filter(u => u.id !== id);
    storageService.saveTodosUsuarios(usuarios);
  },

  // --- GESTÃO de VEÍCULOS ---
  getVeiculos: (): Veiculo[] => {
    const stored = localStorage.getItem(STORAGE_KEY_VEICULOS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_VEICULOS, JSON.stringify(MOCK_VEICULOS));
      return MOCK_VEICULOS;
    }
    return JSON.parse(stored);
  },

  saveTodosVeiculos: (veiculos: Veiculo[]): void => {
    localStorage.setItem(STORAGE_KEY_VEICULOS, JSON.stringify(veiculos));
  },

  createVeiculo: (input: Omit<Veiculo, 'id'>): Veiculo => {
    const veiculos = storageService.getVeiculos();

    const placaExiste = veiculos.some(v => v.placa.toUpperCase() === input.placa.toUpperCase());
    if (placaExiste) {
      throw new Error('Já existe um veículo cadastrado com esta placa.');
    }

    const novoVeiculo: Veiculo = {
      id: veiculos.length > 0 ? Math.max(...veiculos.map(v => v.id)) + 1 : 1,
      ...input,
      placa: input.placa.toUpperCase(),
    };

    const veiculosAtualizados = [novoVeiculo, ...veiculos];
    storageService.saveTodosVeiculos(veiculosAtualizados);
    return novoVeiculo;
  },

  updateVeiculo: (id: number, input: Partial<Veiculo>): Veiculo => {
    const veiculos = storageService.getVeiculos();
    const index = veiculos.findIndex(v => v.id === id);
    if (index === -1) throw new Error('Veículo não encontrado.');

    const veiculoAtualizado = {
      ...veiculos[index],
      ...input,
    };

    veiculos[index] = veiculoAtualizado;
    storageService.saveTodosVeiculos(veiculos);
    return veiculoAtualizado;
  },

  deleteVeiculo: (id: number): void => {
    const veiculos = storageService.getVeiculos().filter(v => v.id !== id);
    storageService.saveTodosVeiculos(veiculos);
  },

  // --- GESTÃO de MOTORISTAS ---
  getMotoristas: (): Motorista[] => {
    const stored = localStorage.getItem(STORAGE_KEY_MOTORISTAS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_MOTORISTAS, JSON.stringify(MOCK_MOTORISTAS));
      return MOCK_MOTORISTAS;
    }
    return JSON.parse(stored);
  },

  saveTodosMotoristas: (motoristas: Motorista[]): void => {
    localStorage.setItem(STORAGE_KEY_MOTORISTAS, JSON.stringify(motoristas));
  },

  createMotorista: (input: Omit<Motorista, 'id' | 'usuario_id'>): Motorista => {
    const motoristas = storageService.getMotoristas();

    const cnhExiste = motoristas.some(m => m.numero_cnh === input.numero_cnh);
    if (cnhExiste) {
      throw new Error('Já existe um motorista cadastrado com esta CNH.');
    }

    const novoMotorista: Motorista = {
      id: motoristas.length > 0 ? Math.max(...motoristas.map(m => m.id)) + 1 : 1,
      usuario_id: 1000 + (motoristas.length + 1),
      ...input,
      status: 'DISPONIVEL',
    };

    const motoristasAtualizados = [novoMotorista, ...motoristas];
    storageService.saveTodosMotoristas(motoristasAtualizados);
    return novoMotorista;
  },

  deleteMotorista: (id: number): void => {
    const motoristas = storageService.getMotoristas().filter(m => m.id !== id);
    storageService.saveTodosMotoristas(motoristas);
  },

  // --- GESTÃO de VIAGENS ---
  getViagens: (): Viagem[] => {
    const stored = localStorage.getItem(STORAGE_KEY_VIAGENS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_VIAGENS, JSON.stringify(MOCK_VIAGENS));
      return MOCK_VIAGENS;
    }
    return JSON.parse(stored);
  },

  saveTodosViagens: (viagens: Viagem[]): void => {
    localStorage.setItem(STORAGE_KEY_VIAGENS, JSON.stringify(viagens));
  },

  createViagem: (input: Omit<Viagem, 'id'>): Viagem => {
    const viagens = storageService.getViagens();
    const novaViagem: Viagem = {
      id: viagens.length > 0 ? Math.max(...viagens.map(v => v.id)) + 1 : 1,
      ...input,
    };
    const viagensAtualizadas = [novaViagem, ...viagens];
    storageService.saveTodosViagens(viagensAtualizadas);

    // Espelha a regra do backend: viagem criada a partir de solicitação aprovada
    // move a solicitação para AGENDADA.
    const solicitacao = storageService.getSolicitacoes().find((s) => s.id === input.solicitacao_id);
    if (solicitacao?.status === 'APROVADA') {
      storageService.atualizarStatusSolicitacao(solicitacao.id, 'AGENDADA');
    }

    // Atualiza status do veículo (se DISPONIVEL -> RESERVADO ou EM_USO)
    const veiculos = storageService.getVeiculos();
    const veiculoIndex = veiculos.findIndex(v => v.id === input.veiculo_id);
    if (veiculoIndex !== -1 && veiculos[veiculoIndex].status === 'DISPONIVEL') {
      veiculos[veiculoIndex].status = input.status === 'EM_ANDAMENTO' ? 'EM_USO' : 'RESERVADO';
      storageService.saveTodosVeiculos(veiculos);
    }

    // Atualiza status do motorista (se DISPONIVEL -> DESIGNADO ou EM_VIAGEM)
    const motoristas = storageService.getMotoristas();
    const motoristaIndex = motoristas.findIndex(m => m.id === input.motorista_id);
    if (motoristaIndex !== -1 && motoristas[motoristaIndex].status === 'DISPONIVEL') {
      motoristas[motoristaIndex].status = input.status === 'EM_ANDAMENTO' ? 'EM_VIAGEM' : 'DESIGNADO';
      storageService.saveTodosMotoristas(motoristas);
    }

    // Sincroniza rota na Agenda operacional (@fsph:agenda)
    try {
      const agenda = storageService.getAgenda();
      const veiculo = veiculos.find((v) => v.id === input.veiculo_id);
      const dataHoraSaida = input.data_hora_efetiva_saida || '2026-10-19T08:00:00';
      const [dataSaida, horaCompleta] = dataHoraSaida.split('T');
      const horaInicio = horaCompleta ? horaCompleta.slice(0, 5) : '08:00';
      const horaFim = input.data_hora_efetiva_chegada
        ? input.data_hora_efetiva_chegada.split('T')[1]?.slice(0, 5) || '10:30'
        : '10:30';

      const novaRota: RotaAgenda = {
        id: novaViagem.id,
        solicitacao_id: input.solicitacao_id || novaViagem.id,
        tipo_operacao: input.tipo_operacao,
        origem: input.origem ?? '',
        destino: input.destino ?? '',
        finalidade: input.finalidade || 'Atendimento de viagem programada',
        solicitante_nome: input.solicitante_nome ?? '',
        veiculo_id: input.veiculo_id,
        veiculo_modelo: input.veiculo_modelo,
        veiculo_placa: input.veiculo_placa,
        capacidade_maxima: veiculo?.capacidade_maxima || 4,
        motorista_id: input.motorista_id,
        motorista_nome: input.motorista_nome,
        data: dataSaida || '2026-10-19',
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        km_estimado: 35,
        status: input.status,
      };

      const ehHoje = dataSaida === '2026-10-19' || dataSaida === new Date().toISOString().slice(0, 10);
      const hojeAtualizado = ehHoje ? [novaRota, ...agenda.hoje] : agenda.hoje;
      const semanaAtualizada = [novaRota, ...agenda.semana];

      storageService.saveAgenda({
        ...agenda,
        hoje: hojeAtualizado,
        semana: semanaAtualizada,
      });
    } catch {
      // Ignora erro em sincronização secundária
    }

    return novaViagem;
  },

  updateViagem: (id: number, input: Partial<Viagem>): Viagem => {
    const viagens = storageService.getViagens();
    const index = viagens.findIndex(v => v.id === id);
    if (index === -1) throw new Error('Viagem não encontrada.');

    const viagemAtualizada = {
      ...viagens[index],
      ...input,
    };

    viagens[index] = viagemAtualizada;
    storageService.saveTodosViagens(viagens);

    // Se a viagem foi concluída:
    if (input.status === 'CONCLUIDA') {
      // 1. Conclui solicitação associada, se houver
      if (viagemAtualizada.solicitacao_id) {
        const solicitacao = storageService.getSolicitacoes().find((s) => s.id === viagemAtualizada.solicitacao_id);
        if (solicitacao && solicitacao.status !== 'CONCLUIDA') {
          storageService.atualizarStatusSolicitacao(solicitacao.id, 'CONCLUIDA');
        }
      }

      // 2. Libera veículo para DISPONIVEL (se estava RESERVADO ou EM_USO)
      const veiculos = storageService.getVeiculos();
      const veiculoIndex = veiculos.findIndex(v => v.id === viagemAtualizada.veiculo_id);
      if (veiculoIndex !== -1 && (veiculos[veiculoIndex].status === 'EM_USO' || veiculos[veiculoIndex].status === 'RESERVADO')) {
        veiculos[veiculoIndex].status = 'DISPONIVEL';
        storageService.saveTodosVeiculos(veiculos);
      }

      // 3. Libera motorista para DISPONIVEL (se estava EM_VIAGEM ou DESIGNADO)
      const motoristas = storageService.getMotoristas();
      const motoristaIndex = motoristas.findIndex(m => m.id === viagemAtualizada.motorista_id);
      if (motoristaIndex !== -1 && (motoristas[motoristaIndex].status === 'EM_VIAGEM' || motoristas[motoristaIndex].status === 'DESIGNADO')) {
        motoristas[motoristaIndex].status = 'DISPONIVEL';
        storageService.saveTodosMotoristas(motoristas);
      }
    }

    // Sincroniza status na Agenda operacional (@fsph:agenda) se a rota constar na agenda
    try {
      const agenda = storageService.getAgenda();
      let alterou = false;
      const hojeAtualizado = agenda.hoje.map((r) => {
        if (r.id === id) {
          alterou = true;
          return { ...r, status: viagemAtualizada.status };
        }
        return r;
      });
      const semanaAtualizada = agenda.semana.map((r) => {
        if (r.id === id) {
          alterou = true;
          return { ...r, status: viagemAtualizada.status };
        }
        return r;
      });
      if (alterou) {
        storageService.saveAgenda({
          ...agenda,
          hoje: hojeAtualizado,
          semana: semanaAtualizada,
        });
      }
    } catch {
      // Ignora erro
    }

    return viagemAtualizada;
  },

  // --- GESTÃO DE ABASTECIMENTOS ---
  getAbastecimentos: (): Abastecimento[] => {
    const stored = localStorage.getItem(STORAGE_KEY_ABASTECIMENTOS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_ABASTECIMENTOS, JSON.stringify(MOCK_ABASTECIMENTOS));
      return MOCK_ABASTECIMENTOS;
    }
    return JSON.parse(stored);
  },

  saveTodosAbastecimentos: (abastecimentos: Abastecimento[]): void => {
    localStorage.setItem(STORAGE_KEY_ABASTECIMENTOS, JSON.stringify(abastecimentos));
  },

  createAbastecimento: (input: NovoAbastecimentoInput): Abastecimento => {
    const abastecimentos = storageService.getAbastecimentos();
    const veiculos = storageService.getVeiculos();
    const motoristas = storageService.getMotoristas();

    const veiculo = veiculos.find(v => v.id === input.veiculo_id);
    const motorista = motoristas.find(m => m.id === input.motorista_id);

    const valorLitro = input.litros > 0 ? Number((input.valor_total / input.litros).toFixed(2)) : 0;
    const abastecimentoAnterior = abastecimentos.find(a => a.veiculo_id === input.veiculo_id);
    let consumoKml = 9.0;
    if (abastecimentoAnterior && input.quilometragem > abastecimentoAnterior.quilometragem && input.litros > 0) {
      consumoKml = Number(((input.quilometragem - abastecimentoAnterior.quilometragem) / input.litros).toFixed(1));
    }

    const novoAbastecimento: Abastecimento = {
      id: abastecimentos.length > 0 ? Math.max(...abastecimentos.map(a => a.id)) + 1 : 1,
      veiculo_id: input.veiculo_id,
      motorista_id: input.motorista_id,
      fornecedor_id: input.fornecedor_id ?? null,
      data_abastecimento: input.data_abastecimento,
      quilometragem: input.quilometragem,
      litros: input.litros,
      valor_total: input.valor_total,
      posto_combustivel: input.posto_combustivel ?? 'Posto não informado',
      veiculo_placa: veiculo?.placa ?? 'N/D',
      veiculo_modelo: veiculo?.modelo ?? '',
      motorista_nome: motorista?.nome ?? 'N/D',
      valor_litro: valorLitro,
      consumo_kml: consumoKml,
      status: 'CONFIRMADO',
    };

    const atualizados = [novoAbastecimento, ...abastecimentos];
    storageService.saveTodosAbastecimentos(atualizados);
    return novoAbastecimento;
  },

  deleteAbastecimento: (id: number): void => {
    const abastecimentos = storageService.getAbastecimentos().filter(a => a.id !== id);
    storageService.saveTodosAbastecimentos(abastecimentos);
  },

  // --- GESTÃO DE MANUTENÇÕES ---
  getManutencoes: (): Manutencao[] => {
    const stored = localStorage.getItem(STORAGE_KEY_MANUTENCOES);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_MANUTENCOES, JSON.stringify(MOCK_MANUTENCOES));
      return MOCK_MANUTENCOES;
    }
    return JSON.parse(stored);
  },

  getManutencoesPorVeiculo: (veiculoId: number): Manutencao[] => {
    return storageService
      .getManutencoes()
      .filter((m) => m.veiculo_id === veiculoId)
      .sort((a, b) => new Date(b.data_manutencao).getTime() - new Date(a.data_manutencao).getTime());
  },

  saveTodosManutencoes: (manutencoes: Manutencao[]): void => {
    localStorage.setItem(STORAGE_KEY_MANUTENCOES, JSON.stringify(manutencoes));
  },

  createManutencao: (input: NovaManutencaoInput): Manutencao => {
    const manutencoes = storageService.getManutencoes();
    const veiculos = storageService.getVeiculos();
    const veiculo = veiculos.find((v) => v.id === input.veiculo_id);

    if (!veiculo) {
      throw new Error('Veículo não encontrado.');
    }

    if (input.custo < 0) {
      throw new Error('O custo da manutenção não pode ser negativo.');
    }

    if (!input.descricao?.trim()) {
      throw new Error('A descrição da intervenção é obrigatória.');
    }

    const novaManutencao: Manutencao = {
      id: manutencoes.length > 0 ? Math.max(...manutencoes.map((m) => m.id)) + 1 : 1,
      veiculo_id: input.veiculo_id,
      fornecedor_id: input.fornecedor_id ?? null,
      tipo_manutencao: input.tipo_manutencao,
      data_manutencao: input.data_manutencao,
      descricao: input.descricao.trim(),
      custo: Number(input.custo),
      status: input.status,
      veiculo_placa: veiculo.placa,
      veiculo_modelo: veiculo.modelo,
      fornecedor_nome: input.fornecedor_id ? 'Oficina Autorizada' : undefined,
    };

    const atualizadas = [novaManutencao, ...manutencoes];
    storageService.saveTodosManutencoes(atualizadas);

    // Se o status for EM_ANDAMENTO ou se o usuário marcou para atualizar o veículo:
    if (input.status === 'EM_ANDAMENTO' || input.atualizar_status_veiculo) {
      storageService.updateVeiculo(input.veiculo_id, { status: 'MANUTENCAO' });
    } else if (input.status === 'CONCLUIDA' && veiculo.status === 'MANUTENCAO') {
      const temOutraEmAndamento = atualizadas.some(
        (m) => m.veiculo_id === input.veiculo_id && m.status === 'EM_ANDAMENTO'
      );
      if (!temOutraEmAndamento) {
        storageService.updateVeiculo(input.veiculo_id, { status: 'DISPONIVEL' });
      }
    }

    return novaManutencao;
  },

  atualizarStatusManutencao: (
    id: number,
    novoStatus: StatusManutencao
  ): { manutencao: Manutencao; veiculoLiberado: boolean } => {
    const manutencoes = storageService.getManutencoes();
    const index = manutencoes.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('Manutenção não encontrada.');
    }

    const manutencao = manutencoes[index];
    const veiculoId = manutencao.veiculo_id;

    manutencoes[index] = {
      ...manutencao,
      status: novoStatus,
    };
    storageService.saveTodosManutencoes(manutencoes);

    let veiculoLiberado = false;

    if (novoStatus === 'EM_ANDAMENTO') {
      storageService.updateVeiculo(veiculoId, { status: 'MANUTENCAO' });
    } else if (novoStatus === 'CONCLUIDA' || novoStatus === 'AGENDADA') {
      const temOutraEmAndamento = manutencoes.some(
        (m) => m.veiculo_id === veiculoId && m.id !== id && m.status === 'EM_ANDAMENTO'
      );
      if (!temOutraEmAndamento) {
        storageService.updateVeiculo(veiculoId, { status: 'DISPONIVEL' });
        veiculoLiberado = true;
      }
    }

    return { manutencao: manutencoes[index], veiculoLiberado };
  },

  deleteManutencao: (id: number): void => {
    const manutencoes = storageService.getManutencoes().filter((m) => m.id !== id);
    storageService.saveTodosManutencoes(manutencoes);
  },

  // --- GESTÃO DE MULTAS / INFRAÇÕES ---
  getMultas: (): Multa[] => {
    const stored = localStorage.getItem(STORAGE_KEY_MULTAS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_MULTAS, JSON.stringify(MOCK_MULTAS));
      return MOCK_MULTAS;
    }
    return JSON.parse(stored);
  },

  saveTodasMultas: (multas: Multa[]): void => {
    localStorage.setItem(STORAGE_KEY_MULTAS, JSON.stringify(multas));
  },

  /** Valida as regras do banco (valor > 0, pontos >= 0, status válido, FKs existentes). */
  _validarMulta: (input: Partial<NovaMultaInput>): void => {
    if (input.valor !== undefined && !(input.valor > 0)) {
      throw new Error('O valor da multa deve ser maior que zero.');
    }
    if (input.pontos !== undefined && (!Number.isInteger(input.pontos) || input.pontos < 0)) {
      throw new Error('Os pontos devem ser um número inteiro maior ou igual a zero.');
    }
    if (input.veiculo_id !== undefined && !storageService.getVeiculos().some(v => v.id === input.veiculo_id)) {
      throw new Error('Veículo não encontrado.');
    }
    if (input.motorista_id && !storageService.getMotoristas().some(m => m.id === input.motorista_id)) {
      throw new Error('Motorista não encontrado.');
    }
  },

  _enriquecerMulta: (multa: Multa): Multa => {
    const veiculo = storageService.getVeiculos().find(v => v.id === multa.veiculo_id);
    const motorista = multa.motorista_id
      ? storageService.getMotoristas().find(m => m.id === multa.motorista_id)
      : undefined;
    return {
      ...multa,
      veiculo_placa: veiculo?.placa ?? 'N/D',
      veiculo_modelo: veiculo?.modelo ?? '',
      motorista_nome: motorista?.nome ?? null,
    };
  },

  createMulta: (input: NovaMultaInput): Multa => {
    storageService._validarMulta(input);
    const multas = storageService.getMultas();

    const nova: Multa = storageService._enriquecerMulta({
      id: multas.length > 0 ? Math.max(...multas.map(m => m.id)) + 1 : 1,
      veiculo_id: input.veiculo_id,
      motorista_id: input.motorista_id ?? null,
      id_infracao: input.id_infracao?.trim() || null,
      orgao_autuador: input.orgao_autuador?.trim() || null,
      data_infracao: input.data_infracao,
      data_vencimento: input.data_vencimento || null,
      status_pagamento: input.status_pagamento ?? 'PENDENTE',
      valor: input.valor,
      descricao: input.descricao?.trim() || null,
      pontos: input.pontos,
    });

    storageService.saveTodasMultas([nova, ...multas]);
    return nova;
  },

  updateMulta: (id: number, input: AtualizarMultaInput): Multa => {
    storageService._validarMulta(input);
    const multas = storageService.getMultas();
    const index = multas.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Multa não encontrada.');

    const atualizada = storageService._enriquecerMulta({ ...multas[index], ...input } as Multa);
    multas[index] = atualizada;
    storageService.saveTodasMultas(multas);
    return atualizada;
  },

  deleteMulta: (id: number): void => {
    const multas = storageService.getMultas().filter(m => m.id !== id);
    storageService.saveTodasMultas(multas);
  },

  // --- GESTÃO DE SOLICITAÇÕES DE VIAGEM ---
  getSolicitacoes: (): SolicitacaoViagem[] => {
    const stored = localStorage.getItem(STORAGE_KEY_SOLICITACOES);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_SOLICITACOES, JSON.stringify(MOCK_SOLICITACOES));
      return MOCK_SOLICITACOES;
    }
    return JSON.parse(stored);
  },

  saveTodasSolicitacoes: (solicitacoes: SolicitacaoViagem[]): void => {
    localStorage.setItem(STORAGE_KEY_SOLICITACOES, JSON.stringify(solicitacoes));
  },

  getSolicitacoesPendentes: (): SolicitacaoViagem[] => {
    return storageService.getSolicitacoes().filter((s) => s.status === 'PENDENTE_APROVACAO');
  },

  /** Solicitações aprovadas que ainda não viraram viagem (disponíveis para despacho). */
  getSolicitacoesAprovadas: (): SolicitacaoViagem[] => {
    return storageService.getSolicitacoes().filter((s) => s.status === 'APROVADA');
  },

  createSolicitacao: (input: NovaSolicitacaoInput): SolicitacaoViagem => {
    if (!input.origem?.trim() || !input.destino?.trim() || !input.finalidade?.trim()) {
      throw new Error('Origem, destino e finalidade são obrigatórios.');
    }
    if (input.data_chegada_desejada && input.data_chegada_desejada < input.data_saida_desejada) {
      throw new Error('A data de chegada deve ser posterior à saída.');
    }

    const solicitacoes = storageService.getSolicitacoes();
    const nova: SolicitacaoViagem = {
      id: solicitacoes.length > 0 ? Math.max(...solicitacoes.map((s) => s.id)) + 1 : 1,
      ...input,
      origem: input.origem.trim(),
      destino: input.destino.trim(),
      finalidade: input.finalidade.trim(),
      status: 'PENDENTE_APROVACAO',
      motivo_recusa: null,
    };

    storageService.saveTodasSolicitacoes([nova, ...solicitacoes]);
    return nova;
  },

  /**
   * Atualiza o status da solicitação.
   * O motivo só é gravado em RECUSADA (como no backend); nos demais status é limpo.
   */
  atualizarStatusSolicitacao: (
    id: number,
    status: SolicitacaoViagem['status'],
    motivoRecusa?: string
  ): SolicitacaoViagem => {
    const solicitacoes = storageService.getSolicitacoes();
    const index = solicitacoes.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('Solicitação de viagem não encontrada.');

    solicitacoes[index] = {
      ...solicitacoes[index],
      status,
      motivo_recusa: status === 'RECUSADA' ? motivoRecusa?.trim() || null : null,
    };
    storageService.saveTodasSolicitacoes(solicitacoes);
    return solicitacoes[index];
  },

  aprovarSolicitacao: (id: number): SolicitacaoViagem => {
    const solicitacao = storageService.getSolicitacoes().find((s) => s.id === id);
    if (!solicitacao) throw new Error('Solicitação de viagem não encontrada.');
    if (solicitacao.status !== 'PENDENTE_APROVACAO') {
      throw new Error('Apenas solicitações pendentes podem ser aprovadas ou recusadas.');
    }
    return storageService.atualizarStatusSolicitacao(id, 'APROVADA');
  },

  recusarSolicitacao: (id: number, motivo?: string): SolicitacaoViagem => {
    const solicitacao = storageService.getSolicitacoes().find((s) => s.id === id);
    if (!solicitacao) throw new Error('Solicitação de viagem não encontrada.');
    if (solicitacao.status !== 'PENDENTE_APROVACAO') {
      throw new Error('Apenas solicitações pendentes podem ser aprovadas ou recusadas.');
    }
    return storageService.atualizarStatusSolicitacao(id, 'RECUSADA', motivo);
  },

  /**
   * Consulta recursos disponíveis para atender a solicitação (espelha GET /solicitacoes-viagem/:id/disponibilidade do backend).
   */
  consultarDisponibilidade: (
    solicitacaoId: number
  ): {
    solicitacao_id: number;
    periodo: { inicio: string; fim: string };
    veiculos_disponiveis: Veiculo[];
    motoristas_disponiveis: Motorista[];
  } => {
    const solicitacao = storageService.getSolicitacoes().find((s) => s.id === solicitacaoId);
    if (!solicitacao) throw new Error('Solicitação de viagem não encontrada.');

    const inicio = solicitacao.data_saida_desejada;
    const fim = solicitacao.data_chegada_desejada || solicitacao.data_saida_desejada;

    const veiculos = storageService.getVeiculos().filter((v) => v.status === 'DISPONIVEL');
    const hoje = new Date().toISOString().slice(0, 10);
    const motoristas = storageService.getMotoristas().filter(
      (m) => m.status === 'DISPONIVEL' && m.validade_cnh >= hoje
    );

    return {
      solicitacao_id: solicitacao.id,
      periodo: { inicio, fim },
      veiculos_disponiveis: veiculos,
      motoristas_disponiveis: motoristas,
    };
  },

  // --- AGENDA OPERACIONAL ---
  getAgenda: (): AgendaCache => {
    const stored = localStorage.getItem(STORAGE_KEY_AGENDA);
    if (!stored) {
      const inicial: AgendaCache = {
        hoje: MOCK_AGENDA_HOJE,
        semana: MOCK_AGENDA_SEMANA,
        excecoesMes: MOCK_EXCECOES_MES,
        historicoMes: MOCK_HISTORICO_MES,
      };
      localStorage.setItem(STORAGE_KEY_AGENDA, JSON.stringify(inicial));
      return inicial;
    }
    return JSON.parse(stored);
  },

  saveAgenda: (agenda: AgendaCache): void => {
    localStorage.setItem(STORAGE_KEY_AGENDA, JSON.stringify(agenda));
  },
};
