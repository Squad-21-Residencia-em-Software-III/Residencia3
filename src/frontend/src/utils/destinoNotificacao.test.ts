import { describe, expect, it } from 'vitest';
import { PERFIS } from '../types/usuario';
import {
  perfilPodeAcessarRota,
  resolverDestinoNotificacao,
  rotaFallbackDoPerfil,
  urlInternaSegura,
} from './destinoNotificacao';

describe('destinoNotificacao', () => {
  describe('urlInternaSegura', () => {
    it('aceita rotas internas válidas com query e hash', () => {
      expect(urlInternaSegura('/viagens')).toBe('/viagens');
      expect(urlInternaSegura('/solicitacoes?aba=svo&id=42#detalhe')).toBe(
        '/solicitacoes?aba=svo&id=42#detalhe',
      );
      expect(urlInternaSegura('/minhas-coletas')).toBe('/minhas-coletas');
    });

    it('rejeita URLs externas, protocol-relative, barra invertida, espaços e controle', () => {
      expect(urlInternaSegura('https://evil.com/viagens')).toBeNull();
      expect(urlInternaSegura('http://localhost/viagens')).toBeNull();
      expect(urlInternaSegura('//evil.com/viagens')).toBeNull();
      expect(urlInternaSegura('javascript:alert(1)')).toBeNull();
      expect(urlInternaSegura('/viagens//externo')).toBeNull();
      expect(urlInternaSegura('/viagens\\teste')).toBeNull();
      expect(urlInternaSegura('/viagens com espaco')).toBeNull();
      expect(urlInternaSegura('/viagens\nfoo')).toBeNull();
      expect(urlInternaSegura('')).toBeNull();
      expect(urlInternaSegura(null)).toBeNull();
    });
  });

  describe('RBAC e fallback por perfil', () => {
    it('mantém INTEGRANTE_SVO restrito a /minhas-coletas e nunca libera /viagens', () => {
      expect(perfilPodeAcessarRota(PERFIS.INTEGRANTE_SVO, '/minhas-coletas')).toBe(true);
      expect(perfilPodeAcessarRota(PERFIS.INTEGRANTE_SVO, '/viagens')).toBe(false);
      expect(perfilPodeAcessarRota(PERFIS.INTEGRANTE_SVO, '/inicio')).toBe(false);

      expect(resolverDestinoNotificacao('/viagens', PERFIS.INTEGRANTE_SVO)).toEqual({
        url: '/minhas-coletas',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/minhas-coletas?id=9', PERFIS.INTEGRANTE_SVO)).toEqual({
        url: '/minhas-coletas?id=9',
        usouFallback: false,
      });
    });

    it('redireciona SOLICITANTE sem acesso a /viagens ou /auditoria para /solicitacoes', () => {
      expect(resolverDestinoNotificacao('/solicitacoes?id=10', PERFIS.SOLICITANTE)).toEqual({
        url: '/solicitacoes?id=10',
        usouFallback: false,
      });
      expect(resolverDestinoNotificacao('/viagens', PERFIS.SOLICITANTE)).toEqual({
        url: '/solicitacoes',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/auditoria', PERFIS.SOLICITANTE)).toEqual({
        url: '/solicitacoes',
        usouFallback: true,
      });
    });

    it('respeita permissões de motoristas, gestores e administrador', () => {
      expect(resolverDestinoNotificacao('/viagens', PERFIS.MOTORISTA_FROTA)).toEqual({
        url: '/viagens',
        usouFallback: false,
      });
      expect(resolverDestinoNotificacao('/auditoria', PERFIS.MOTORISTA_SVO)).toEqual({
        url: '/viagens',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/solicitacoes?aba=svo', PERFIS.GESTOR_SVO)).toEqual({
        url: '/solicitacoes?aba=svo',
        usouFallback: false,
      });
      expect(resolverDestinoNotificacao('/auditoria', PERFIS.GESTOR_SVO)).toEqual({
        url: '/inicio',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/auditoria', PERFIS.ADMINISTRADOR)).toEqual({
        url: '/auditoria',
        usouFallback: false,
      });
    });

    it('usa fallback seguro quando a URL é malformada ou desconhecida', () => {
      expect(rotaFallbackDoPerfil(PERFIS.INTEGRANTE_SVO)).toBe('/minhas-coletas');
      expect(rotaFallbackDoPerfil(PERFIS.SOLICITANTE)).toBe('/solicitacoes');
      expect(rotaFallbackDoPerfil(PERFIS.MOTORISTA_FROTA)).toBe('/viagens');
      expect(rotaFallbackDoPerfil(PERFIS.ADMINISTRADOR)).toBe('/inicio');

      expect(resolverDestinoNotificacao('https://malicioso.example', PERFIS.GESTOR_FROTA)).toEqual({
        url: '/inicio',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/rota-inexistente', PERFIS.ADMINISTRADOR)).toEqual({
        url: '/inicio',
        usouFallback: true,
      });
    });
  });
});
