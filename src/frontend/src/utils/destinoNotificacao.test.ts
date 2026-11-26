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

  describe('RBAC, rotas exatas e fallback por perfil', () => {
    it('rejeita subpaths inexistentes em routes/index.tsx e aplica fallback do perfil', () => {
      expect(perfilPodeAcessarRota(PERFIS.ADMINISTRADOR, '/viagens/123')).toBe(false);
      expect(perfilPodeAcessarRota(PERFIS.GESTOR_FROTA, '/solicitacoes/999')).toBe(false);
      expect(perfilPodeAcessarRota(PERFIS.INTEGRANTE_SVO, '/minhas-coletas/42')).toBe(false);

      expect(resolverDestinoNotificacao('/viagens/123', PERFIS.MOTORISTA_FROTA)).toEqual({
        url: '/viagens',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/solicitacoes/999', PERFIS.SOLICITANTE)).toEqual({
        url: '/solicitacoes',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/minhas-coletas/42', PERFIS.INTEGRANTE_SVO)).toEqual({
        url: '/minhas-coletas',
        usouFallback: true,
      });
    });

    it('mantém INTEGRANTE_SVO restrito a /minhas-coletas e /sobre', () => {
      expect(perfilPodeAcessarRota(PERFIS.INTEGRANTE_SVO, '/minhas-coletas')).toBe(true);
      expect(perfilPodeAcessarRota(PERFIS.INTEGRANTE_SVO, '/sobre')).toBe(true);
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

    it('aceita rotas de redirecionamento reais respeitando RBAC', () => {
      expect(resolverDestinoNotificacao('/triagem-svo', PERFIS.GESTOR_SVO)).toEqual({
        url: '/triagem-svo',
        usouFallback: false,
      });
      expect(resolverDestinoNotificacao('/triagem-svo', PERFIS.GESTOR_FROTA)).toEqual({
        url: '/inicio',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/dashboard', PERFIS.GESTOR_FROTA)).toEqual({
        url: '/dashboard',
        usouFallback: false,
      });
      expect(resolverDestinoNotificacao('/motoristas', PERFIS.GESTOR_FROTA)).toEqual({
        url: '/motoristas',
        usouFallback: false,
      });
      expect(resolverDestinoNotificacao('/usuarios', PERFIS.GESTOR_FROTA)).toEqual({
        url: '/inicio',
        usouFallback: true,
      });
      expect(resolverDestinoNotificacao('/usuarios', PERFIS.ADMINISTRADOR)).toEqual({
        url: '/usuarios',
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
