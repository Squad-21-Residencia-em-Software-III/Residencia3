import { describe, expect, it } from 'vitest';

import { LISTA_PERFIS, PERFIS } from '../types/usuario';
import type { Perfil } from '../types/usuario';
import {
  abasDeVeiculos,
  abasDeViagens,
  operacoesAgendaveis,
  PERMISSOES,
  perfilPode,
  podeEditarFrota,
  podeVerDetalhesDaFrota,
} from './permissoes';
import type { Permissao } from './permissoes';

const { ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO, SOLICITANTE, MOTORISTA_FROTA, MOTORISTA_SVO } =
  PERFIS;

/** Perfis que têm a permissão, na ordem de LISTA_PERFIS. */
const quemPode = (permissao: Permissao): Perfil[] =>
  LISTA_PERFIS.filter((perfil) => perfilPode(perfil, permissao));

const ordenar = (perfis: Perfil[]) => [...perfis].sort();

// Documento "Permissões e acesso a telas do sistema" + regras confirmadas com o líder
describe('matriz de permissões por perfil', () => {
  it('Administrador tem acesso a tudo', () => {
    for (const permissao of Object.keys(PERMISSOES) as Permissao[]) {
      expect(perfilPode(ADMINISTRADOR, permissao), permissao).toBe(true);
    }
  });

  it('sem usuário logado, nada é permitido', () => {
    expect(perfilPode(null, 'veiculos.acessar')).toBe(false);
    expect(perfilPode(undefined, 'inicio.painelGerencial')).toBe(false);
  });

  it('Dashboard gerencial: Gestor de Frota, Gestor SVO e Administrador', () => {
    expect(ordenar(quemPode('inicio.painelGerencial'))).toEqual(
      ordenar([ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO]),
    );
  });

  it('Solicitações de viagem: o Solicitante cria e consulta as próprias', () => {
    expect(perfilPode(SOLICITANTE, 'solicitacoes.acessar')).toBe(true);
    expect(perfilPode(SOLICITANTE, 'solicitacoes.criar')).toBe(true);
    expect(perfilPode(SOLICITANTE, 'solicitacoes.listarTodas')).toBe(false);
    expect(perfilPode(SOLICITANTE, 'solicitacoes.analisar')).toBe(false);
  });

  it('Gestor SVO solicita e acompanha só as próprias; não aprova, recusa nem agenda', () => {
    expect(perfilPode(GESTOR_SVO, 'solicitacoes.criar')).toBe(true);
    expect(perfilPode(GESTOR_SVO, 'solicitacoes.listarTodas')).toBe(false);
    expect(perfilPode(GESTOR_SVO, 'solicitacoes.analisar')).toBe(false);
    expect(perfilPode(GESTOR_SVO, 'solicitacoes.agendar')).toBe(false);
    expect(perfilPode(GESTOR_SVO, 'viagens.agendar')).toBe(false);
  });

  it('só Administrador e Gestor de Frota aprovam, recusam e agendam', () => {
    for (const permissao of [
      'solicitacoes.analisar',
      'solicitacoes.agendar',
      'viagens.agendar',
    ] as const) {
      expect(ordenar(quemPode(permissao)), permissao).toEqual(
        ordenar([ADMINISTRADOR, GESTOR_FROTA]),
      );
    }
  });

  it('consulta de todas as solicitações: só Administrador e Gestor de Frota', () => {
    expect(ordenar(quemPode('solicitacoes.listarTodas'))).toEqual(
      ordenar([ADMINISTRADOR, GESTOR_FROTA]),
    );
  });

  it('alocação SVO é separada do agendamento administrativo', () => {
    expect(ordenar(quemPode('viagens.agendar'))).toEqual(ordenar([ADMINISTRADOR, GESTOR_FROTA]));
    expect(ordenar(quemPode('viagens.alocarSvo'))).toEqual(ordenar([ADMINISTRADOR, GESTOR_SVO]));
    // Uma operação não libera a outra
    expect(perfilPode(GESTOR_FROTA, 'viagens.alocarSvo')).toBe(false);
    expect(perfilPode(GESTOR_SVO, 'viagens.agendar')).toBe(false);
  });

  it('operações abertas no agendamento de viagens, por perfil', () => {
    expect(operacoesAgendaveis(ADMINISTRADOR)).toEqual(['ADMINISTRATIVA', 'SVO']);
    expect(operacoesAgendaveis(GESTOR_FROTA)).toEqual(['ADMINISTRATIVA']);
    expect(operacoesAgendaveis(GESTOR_SVO)).toEqual(['SVO']);
    for (const perfil of [MOTORISTA_FROTA, MOTORISTA_SVO, SOLICITANTE, null]) {
      expect(operacoesAgendaveis(perfil), String(perfil)).toEqual([]);
    }
  });

  it('Motoristas executam viagens e registram abastecimentos, sem agendar nem cancelar', () => {
    for (const motorista of [MOTORISTA_FROTA, MOTORISTA_SVO]) {
      expect(perfilPode(motorista, 'viagens.acessar')).toBe(true);
      expect(perfilPode(motorista, 'viagens.executar')).toBe(true);
      expect(perfilPode(motorista, 'abastecimentos.registrar')).toBe(true);
      expect(perfilPode(motorista, 'viagens.agendar')).toBe(false);
      expect(perfilPode(motorista, 'viagens.alocarSvo')).toBe(false);
      expect(perfilPode(motorista, 'viagens.cancelar')).toBe(false);
      expect(perfilPode(motorista, 'solicitacoes.acessar')).toBe(false);
      expect(perfilPode(motorista, 'manutencoes.acessar')).toBe(false);
      expect(perfilPode(motorista, 'multas.acessar')).toBe(false);
    }
  });

  it('Veículos: todos consultam; o Solicitante não vê detalhes; gestores cadastram', () => {
    expect(quemPode('veiculos.acessar')).toEqual(LISTA_PERFIS);
    expect(perfilPode(SOLICITANTE, 'veiculos.detalhes')).toBe(false);
    expect(ordenar(quemPode('veiculos.cadastrar'))).toEqual(
      ordenar([ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO]),
    );
  });

  it('Manutenções e multas: só Administrador e Gestor de Frota (sem o Gestor SVO)', () => {
    for (const permissao of [
      'manutencoes.acessar',
      'manutencoes.gerenciar',
      'multas.acessar',
      'multas.gerenciar',
    ] as const) {
      expect(ordenar(quemPode(permissao)), permissao).toEqual(
        ordenar([ADMINISTRADOR, GESTOR_FROTA]),
      );
    }
  });

  it('Abastecimentos: Administrador, Gestor de Frota e motoristas (sem o Gestor SVO)', () => {
    for (const permissao of ['abastecimentos.acessar', 'abastecimentos.registrar'] as const) {
      expect(ordenar(quemPode(permissao)), permissao).toEqual(
        ordenar([ADMINISTRADOR, GESTOR_FROTA, MOTORISTA_FROTA, MOTORISTA_SVO]),
      );
    }
  });

  it('Disponibilidade da frota: Administrador, Gestor de Frota e Gestor SVO', () => {
    expect(ordenar(quemPode('agenda.acessar'))).toEqual(
      ordenar([ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO]),
    );
  });

  it('Triagem SVO: Administrador e Gestor SVO', () => {
    expect(ordenar(quemPode('triagemSvo.acessar'))).toEqual(ordenar([ADMINISTRADOR, GESTOR_SVO]));
  });

  it('Recusar ou confirmar chamado SVO: Administrador e Gestor SVO', () => {
    expect(ordenar(quemPode('triagemSvo.analisar'))).toEqual(ordenar([ADMINISTRADOR, GESTOR_SVO]));
  });

  it('Usuários e Auditoria: só o Administrador', () => {
    expect(quemPode('usuarios.gerenciar')).toEqual([ADMINISTRADOR]);
    expect(quemPode('auditoria.acessar')).toEqual([ADMINISTRADOR]);
  });
});

describe('abas Administrativo/SVO (SCRUM-166)', () => {
  it('Viagens: cada perfil vê só a operação que a API lhe devolve', () => {
    expect(abasDeViagens(ADMINISTRADOR, false)).toEqual(['ADMINISTRATIVA', 'SVO']);
    expect(abasDeViagens(GESTOR_FROTA, false)).toEqual(['ADMINISTRATIVA']);
    expect(abasDeViagens(MOTORISTA_FROTA, false)).toEqual(['ADMINISTRATIVA']);
    expect(abasDeViagens(GESTOR_SVO, false)).toEqual(['SVO']);
    expect(abasDeViagens(MOTORISTA_SVO, false)).toEqual(['SVO']);
    expect(abasDeViagens(SOLICITANTE, false)).toEqual([]);
    expect(abasDeViagens(null, true)).toEqual([]);
  });

  it('Viagens: com a consulta própria (SCRUM-179) o Gestor SVO ganha a aba Administrativo', () => {
    expect(abasDeViagens(GESTOR_SVO, true)).toEqual(['SVO', 'ADMINISTRATIVA']);
    // Os demais não mudam
    expect(abasDeViagens(GESTOR_FROTA, true)).toEqual(['ADMINISTRATIVA']);
    expect(abasDeViagens(MOTORISTA_SVO, true)).toEqual(['SVO']);
  });

  it('Veículos: as duas frotas para quem vê detalhes, a do perfil primeiro', () => {
    expect(abasDeVeiculos(ADMINISTRADOR)).toEqual(['ADMINISTRATIVA', 'SVO']);
    expect(abasDeVeiculos(GESTOR_FROTA)).toEqual(['ADMINISTRATIVA', 'SVO']);
    expect(abasDeVeiculos(GESTOR_SVO)).toEqual(['SVO', 'ADMINISTRATIVA']);
    expect(abasDeVeiculos(MOTORISTA_SVO)).toEqual(['SVO', 'ADMINISTRATIVA']);
    // O Solicitante tem a tela reduzida, sem abas
    expect(abasDeVeiculos(SOLICITANTE)).toEqual([]);
  });
});

describe('regra de frota (podeEditarFrota)', () => {
  it('Gestor SVO só altera itens da frota SVO', () => {
    expect(podeEditarFrota(GESTOR_SVO, 'SVO')).toBe(true);
    expect(podeEditarFrota(GESTOR_SVO, 'ADMINISTRATIVA')).toBe(false);
    // Frota desconhecida (veículo não encontrado): não libera
    expect(podeEditarFrota(GESTOR_SVO, undefined)).toBe(false);
  });

  it('Gestor de Frota só altera itens da frota administrativa', () => {
    expect(podeEditarFrota(GESTOR_FROTA, 'ADMINISTRATIVA')).toBe(true);
    expect(podeEditarFrota(GESTOR_FROTA, 'SVO')).toBe(false);
  });

  it('Administrador altera as duas frotas', () => {
    expect(podeEditarFrota(ADMINISTRADOR, 'ADMINISTRATIVA')).toBe(true);
    expect(podeEditarFrota(ADMINISTRADOR, 'SVO')).toBe(true);
    expect(podeEditarFrota(ADMINISTRADOR, undefined)).toBe(false);
  });

  it('motoristas só registram na própria frota', () => {
    expect(podeEditarFrota(MOTORISTA_FROTA, 'ADMINISTRATIVA')).toBe(true);
    expect(podeEditarFrota(MOTORISTA_FROTA, 'SVO')).toBe(false);
    expect(podeEditarFrota(MOTORISTA_SVO, 'SVO')).toBe(true);
    expect(podeEditarFrota(MOTORISTA_SVO, 'ADMINISTRATIVA')).toBe(false);
  });

  it('detalhes (km, custos, históricos): gestor só da própria frota', () => {
    expect(podeVerDetalhesDaFrota(ADMINISTRADOR, 'SVO')).toBe(true);
    expect(podeVerDetalhesDaFrota(ADMINISTRADOR, 'ADMINISTRATIVA')).toBe(true);
    expect(podeVerDetalhesDaFrota(GESTOR_FROTA, 'ADMINISTRATIVA')).toBe(true);
    expect(podeVerDetalhesDaFrota(GESTOR_FROTA, 'SVO')).toBe(false);
    expect(podeVerDetalhesDaFrota(GESTOR_SVO, 'SVO')).toBe(true);
    expect(podeVerDetalhesDaFrota(GESTOR_SVO, 'ADMINISTRATIVA')).toBe(false);
    expect(podeVerDetalhesDaFrota(SOLICITANTE, 'ADMINISTRATIVA')).toBe(false);
    expect(podeVerDetalhesDaFrota(null, 'SVO')).toBe(false);
  });

  it('Solicitante não altera nenhuma frota', () => {
    expect(podeEditarFrota(SOLICITANTE, 'ADMINISTRATIVA')).toBe(false);
    expect(podeEditarFrota(SOLICITANTE, 'SVO')).toBe(false);
  });

  it('sem usuário, nada é permitido', () => {
    expect(podeEditarFrota(null, 'SVO')).toBe(false);
  });
});
