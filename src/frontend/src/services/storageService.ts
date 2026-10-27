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
import type { Manutencao, NovaManutencaoInput, StatusManutencao } from '../types/manutencao';
import { MOCK_MANUTENCOES } from './mocks/manutencoesMock';

const STORAGE_KEY_USUARIOS = '@fsph:usuarios';
const STORAGE_KEY_VEICULOS = '@fsph:veiculos';
const STORAGE_KEY_MOTORISTAS = '@fsph:motoristas';
const STORAGE_KEY_VIAGENS = '@fsph:viagens';
const STORAGE_KEY_ABASTECIMENTOS = '@fsph:abastecimentos';
const STORAGE_KEY_MANUTENCOES = '@fsph:manutencoes';

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
};



