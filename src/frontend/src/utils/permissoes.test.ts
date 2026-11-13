import { describe, expect, it } from 'vitest';

import { LISTA_PERFIS, PERFIS } from '../types/usuario';
import type { Perfil } from '../types/usuario';
import { PERMISSOES, perfilPode, podeEditarFrota } from './permissoes';
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

  it('Gestor SVO solicita e visualiza a frota administrativa, mas não aprova, recusa nem agenda', () => {
    expect(perfilPode(GESTOR_SVO, 'solicitacoes.criar')).toBe(true);
    expect(perfilPode(GESTOR_SVO, 'solicitacoes.listarTodas')).toBe(true);
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

  it('Motoristas executam viagens e registram abastecimentos, sem agendar nem cancelar', () => {
    for (const motorista of [MOTORISTA_FROTA, MOTORISTA_SVO]) {
      expect(perfilPode(motorista, 'viagens.acessar')).toBe(true);
      expect(perfilPode(motorista, 'viagens.executar')).toBe(true);
      expect(perfilPode(motorista, 'abastecimentos.registrar')).toBe(true);
      expect(perfilPode(motorista, 'viagens.agendar')).toBe(false);
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

  it('Manutenções, multas e disponibilidade: Administrador, Gestor de Frota e Gestor SVO', () => {
    const gestores = ordenar([ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO]);
    for (const permissao of [
      'manutencoes.acessar',
      'manutencoes.gerenciar',
      'multas.acessar',
      'multas.gerenciar',
      'agenda.acessar',
    ] as const) {
      expect(ordenar(quemPode(permissao)), permissao).toEqual(gestores);
    }
  });

  it('Triagem SVO: Administrador e Gestor SVO', () => {
    expect(ordenar(quemPode('triagemSvo.acessar'))).toEqual(ordenar([ADMINISTRADOR, GESTOR_SVO]));
  });

  it('Usuários e Auditoria: só o Administrador', () => {
    expect(quemPode('usuarios.gerenciar')).toEqual([ADMINISTRADOR]);
    expect(quemPode('auditoria.acessar')).toEqual([ADMINISTRADOR]);
  });
});

describe('regra de frota (podeEditarFrota)', () => {
  it('Gestor SVO só altera itens da frota SVO', () => {
    expect(podeEditarFrota(GESTOR_SVO, 'SVO')).toBe(true);
    expect(podeEditarFrota(GESTOR_SVO, 'ADMINISTRATIVA')).toBe(false);
    // Frota desconhecida (veículo não encontrado): não libera
    expect(podeEditarFrota(GESTOR_SVO, undefined)).toBe(false);
  });

  it('os demais perfis não têm restrição de frota', () => {
    for (const perfil of [ADMINISTRADOR, GESTOR_FROTA, MOTORISTA_FROTA]) {
      expect(podeEditarFrota(perfil, 'ADMINISTRATIVA')).toBe(true);
      expect(podeEditarFrota(perfil, 'SVO')).toBe(true);
    }
  });

  it('sem usuário, nada é permitido', () => {
    expect(podeEditarFrota(null, 'SVO')).toBe(false);
  });
});
