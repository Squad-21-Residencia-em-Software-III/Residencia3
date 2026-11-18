import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env, type DriverArmazenamentoEvidencias } from '../config/env';
import { AppError } from '../errors/AppError';

/**
 * Onde ficam os arquivos das fotos do odômetro (SCRUM-208/209/211). O banco guarda só a
 * storage_key; os bytes ficam aqui, nunca em log, auditoria ou JSON da viagem.
 * Novos destinos (ex.: bucket privado) implementam esta interface.
 */
export interface ArmazenamentoEvidencias {
  salvar(chave: string, conteudo: Buffer): Promise<void>;
  ler(chave: string): Promise<Buffer>;
  remover(chave: string): Promise<void>;
}

// Formato gerado pelo service: odometro/<usuario>/<uuid>. Nada de "..", barra inicial ou esquema.
const CHAVE_SEGURA = /^odometro\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validarChave(chave: string): string {
  if (!CHAVE_SEGURA.test(chave)) {
    throw new AppError('Chave de armazenamento inválida', 500);
  }
  return chave;
}

export const MENSAGEM_ARMAZENAMENTO_DESATIVADO =
  'O envio de fotos do odômetro ainda não está disponível: o armazenamento não foi configurado.';

const desativado: ArmazenamentoEvidencias = {
  async salvar() {
    throw new AppError(MENSAGEM_ARMAZENAMENTO_DESATIVADO, 503);
  },
  async ler() {
    throw new AppError(MENSAGEM_ARMAZENAMENTO_DESATIVADO, 503);
  },
  async remover() {
    // Nada a remover
  },
};

export function armazenamentoLocal(pastaBase: string): ArmazenamentoEvidencias {
  const base = path.resolve(pastaBase);
  const caminho = (chave: string) => {
    const destino = path.resolve(base, validarChave(chave));
    // Defesa extra: o destino nunca sai da pasta base
    if (!destino.startsWith(base + path.sep)) {
      throw new AppError('Chave de armazenamento inválida', 500);
    }
    return destino;
  };

  return {
    async salvar(chave, conteudo) {
      const destino = caminho(chave);
      await mkdir(path.dirname(destino), { recursive: true });
      // Grava num temporário e renomeia: um leitor nunca vê arquivo pela metade.
      // "wx" impede sobrescrever um temporário de outra gravação.
      const temporario = `${destino}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporario, conteudo, { flag: 'wx', mode: 0o600 });
      try {
        await rename(temporario, destino);
      } catch (erro) {
        await rm(temporario, { force: true });
        throw erro;
      }
    },
    async ler(chave) {
      try {
        return await readFile(caminho(chave));
      } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new AppError('O arquivo da foto não foi encontrado no armazenamento', 404);
        }
        throw erro;
      }
    },
    async remover(chave) {
      await rm(caminho(chave), { force: true });
    },
  };
}

function criar(driver: DriverArmazenamentoEvidencias): ArmazenamentoEvidencias {
  return driver === 'local' ? armazenamentoLocal(env.evidenciasStorageDir) : desativado;
}

let atual: ArmazenamentoEvidencias | undefined;

export function armazenamentoEvidencias(): ArmazenamentoEvidencias {
  atual ??= criar(env.evidenciasStorage);
  return atual;
}

export function armazenamentoConfigurado(): boolean {
  return armazenamentoEvidencias() !== desativado;
}

/** Só para testes: troca o destino dos arquivos. */
export function definirArmazenamentoEvidencias(novo: ArmazenamentoEvidencias | undefined): void {
  atual = novo;
}
