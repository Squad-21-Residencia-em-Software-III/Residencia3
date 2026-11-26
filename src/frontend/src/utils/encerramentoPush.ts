import { confirmarEncerramento, lerEstadoPush } from '../sw/estadoPush';
import { assinaturaDoAparelho, encerrarAssinatura } from './pushNavegador';

const CHAVE = 'fsph.push.encerrar';

// Só quando o navegador bloqueia o armazenamento: aí a marca não passa desta aba
let marcaEmMemoria = false;

function marcado(): boolean {
  if (marcaEmMemoria) return true;
  try {
    return localStorage.getItem(CHAVE) !== null;
  } catch {
    return false;
  }
}

/**
 * Marca que os alertas deste aparelho precisam ser encerrados. Sobrevive ao fechamento do aplicativo e vale
 * para todas as abas, para uma falha ao sair da conta não ser esquecida.
 */
export function marcarEncerramento(): void {
  try {
    localStorage.setItem(CHAVE, '1');
  } catch {
    marcaEmMemoria = true;
  }
}

function desmarcar(): void {
  marcaEmMemoria = false;
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // Sem armazenamento, só existia a marca em memória
  }
}

/**
 * Cumpre o encerramento marcado, se houver. Responde `false` se a assinatura continua no navegador. Chamar na
 * fila (`emSequencia`), antes de qualquer ativação: assim nunca atinge uma assinatura nova.
 */
export async function cumprirEncerramento(): Promise<boolean> {
  if (!marcado() && !(await lerEstadoPush())?.encerramento) return true;
  const assinatura = await assinaturaDoAparelho();
  if (assinatura && !(await encerrarAssinatura(assinatura.endpoint).catch(() => false))) return false;
  await confirmarEncerramento();
  desmarcar();
  return true;
}
