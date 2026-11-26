import { db } from '../config/database';
import { env } from '../config/env';
import { categoriaPermitida, categoriasDoPerfil } from '../constants/categoriasNotificacao';
import { AppError } from '../errors/AppError';
import type { Usuario } from '../models/usuarioModel';
import { pushAssinaturaModel } from '../models/pushAssinaturaModel';

// Alertas no aparelho (SCRUM-237, contrato em docs/scrum-238-contrato-push.md). Sempre o usuário da sessão:
// nenhuma rota aceita id de usuário do cliente. Nada aqui altera os avisos dentro do sistema.

const VIOLACAO_REGRA_POSTGRES = '23514';
const LIMITE_USER_AGENT = 255;

export interface DadosAssinatura {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface CategoriaPreferencia {
  codigo: string;
  titulo: string;
  descricao: string;
  push: boolean;
}

function configuracao() {
  if (!env.webPush) throw new AppError('Os alertas no aparelho não estão disponíveis no momento.', 503, 'PUSH_DESLIGADO');
  return env.webPush;
}

// Sem caracteres de controle e no tamanho da coluna; ajuda a pessoa a reconhecer o aparelho
function userAgentSeguro(valor: string | undefined): string | null {
  const limpo = [...(valor ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, LIMITE_USER_AGENT).join('');
  return limpo || null;
}

// Sem dizer de quem é o endpoint nem o id de ninguém
function erroDaAssinatura(erro: unknown): never {
  if (typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === VIOLACAO_REGRA_POSTGRES) {
    const mensagem = 'message' in erro ? String(erro.message) : '';
    const limite = /Limite maximo de (\d+) dispositivos/.exec(mensagem)?.[1];
    if (limite) {
      throw new AppError(
        `Você já tem ${limite} aparelhos com alertas. Desligue os alertas em um deles para ligar neste.`,
        409,
        'PUSH_LIMITE_DISPOSITIVOS'
      );
    }
    throw new AppError('Este aparelho já está com alertas de outra conta. Saia dela no aparelho e tente de novo.', 409, 'PUSH_ENDPOINT_EM_USO');
  }
  throw erro;
}

export const pushService = {
  chavePublica(): { publicKey: string } {
    return { publicKey: configuracao().publicKey };
  },

  /** `criada: false` é renovação do mesmo aparelho (idempotente). */
  async assinar(usuario: Usuario, dados: DadosAssinatura, userAgent: string | undefined): Promise<{ criada: boolean }> {
    configuracao();
    try {
      return await db.transaction((trx) =>
        pushAssinaturaModel.assinar(
          {
            usuario_id: usuario.id,
            endpoint: dados.endpoint,
            p256dh: dados.keys.p256dh,
            auth: dados.keys.auth,
            user_agent: userAgentSeguro(userAgent),
          },
          trx
        )
      );
    } catch (erro) {
      erroDaAssinatura(erro);
    }
  },

  /** `true` só se a assinatura existe, está ativa e é do usuário da sessão. */
  async situacao(usuario: Usuario, endpoint: string): Promise<{ ativa: boolean }> {
    return { ativa: await pushAssinaturaModel.ativaDoUsuario(usuario.id, endpoint) };
  },

  /** Também funciona com o push desligado: a pessoa sempre consegue encerrar a assinatura. */
  async cancelar(usuario: Usuario, endpoint: string): Promise<void> {
    await pushAssinaturaModel.cancelar(usuario.id, endpoint);
  },

  /** Só as categorias do perfil. Sem escolha registrada, desligada (padrão da SCRUM-236). */
  async preferencias(usuario: Usuario): Promise<{ categorias: CategoriaPreferencia[] }> {
    const salvas = await pushAssinaturaModel.preferencias(usuario.id);
    return {
      categorias: categoriasDoPerfil(usuario.perfil).map(({ codigo, titulo, descricao }) => ({
        codigo, titulo, descricao, push: salvas.get(codigo) ?? false,
      })),
    };
  },

  async salvarPreferencia(usuario: Usuario, codigo: string, push: boolean): Promise<CategoriaPreferencia> {
    if (!categoriaPermitida(usuario.perfil, codigo)) throw new AppError('Categoria de alerta não encontrada', 404);
    await pushAssinaturaModel.salvarPreferencia(usuario.id, codigo, push);
    const { titulo, descricao } = categoriasDoPerfil(usuario.perfil).find((c) => c.codigo === codigo)!;
    return { codigo, titulo, descricao, push };
  },
};
