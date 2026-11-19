import { createHash, randomBytes } from 'node:crypto';
import { link, mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { env, type DriverArmazenamentoEvidencias } from '../config/env';
import { AppError } from '../errors/AppError';
import { armazenamentoR2 } from './armazenamentoEvidenciasR2';
import { limiteLeituraEvidencia, validarChave } from './chavesEvidencias';

export { validarChave } from './chavesEvidencias';

/**
 * Onde ficam os arquivos das fotos do odômetro (SCRUM-208/209/211). O banco guarda só a
 * storage_key; os bytes ficam aqui, nunca em log, auditoria ou JSON da viagem.
 * Novos destinos (ex.: bucket privado) implementam esta interface.
 */
export interface ArmazenamentoEvidencias {
  salvar(chave: string, conteudo: Buffer, tipo?: string): Promise<void>;
  ler(chave: string, maxBytes?: number): Promise<Buffer>;
  remover(chave: string): Promise<void>;
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
    throw new AppError(MENSAGEM_ARMAZENAMENTO_DESATIVADO, 503);
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

  async function ler(chave: string, maxBytes = limiteLeituraEvidencia): Promise<Buffer> {
    try {
      const arquivo = await open(caminho(chave), 'r');
      try {
        const { size } = await arquivo.stat();
        if (size > maxBytes) throw new AppError('Tamanho do objeto de evidência inválido', 502);
        const bytes = Buffer.alloc(size + 1);
        let tamanho = 0;
        while (tamanho < bytes.length) {
          const { bytesRead } = await arquivo.read(bytes, tamanho, bytes.length - tamanho, null);
          if (!bytesRead) break;
          tamanho += bytesRead;
        }
        if (tamanho !== size) throw new AppError('Tamanho do objeto de evidência inválido', 502);
        return bytes.subarray(0, tamanho);
      } finally {
        await arquivo.close();
      }
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError('O arquivo da foto não foi encontrado no armazenamento', 404);
      }
      throw erro;
    }
  }

  return {
    ler,
    async salvar(chave, conteudo) {
      const destino = caminho(chave);
      await mkdir(path.dirname(destino), { recursive: true });
      const temporario = `${destino}.${randomBytes(12).toString('hex')}.tmp`;
      const arquivo = await open(temporario, 'wx', 0o600);
      try {
        try {
          await arquivo.writeFile(conteudo);
        } finally {
          await arquivo.close();
        }
        // A publicação é atômica e o hard link falha se o destino já existir.
        await link(temporario, destino);
      } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code !== 'EEXIST') throw erro;
        if (!(await ler(chave)).equals(conteudo)) {
          throw new AppError('Esta chave já está associada a outro conteúdo', 409);
        }
      } finally {
        await rm(temporario, { force: true });
      }
    },
    async remover(chave) {
      await rm(caminho(chave), { force: true });
    },
  };
}

function criar(driver: DriverArmazenamentoEvidencias): ArmazenamentoEvidencias {
  if (driver === 'r2' && env.evidenciasR2) return armazenamentoR2(env.evidenciasR2);
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

export async function lerEvidenciaVerificada(chave: string, tamanho: number, sha256: string): Promise<Buffer> {
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > limiteLeituraEvidencia || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new AppError('Metadados de evidência inválidos', 502);
  }
  const bytes = await armazenamentoEvidencias().ler(chave, tamanho);
  if (bytes.length !== tamanho || createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new AppError('Falha de integridade da evidência', 502, 'EVIDENCIAS_INTEGRIDADE');
  }
  return bytes;
}

/** Só para testes: troca o destino dos arquivos. */
export function definirArmazenamentoEvidencias(novo: ArmazenamentoEvidencias | undefined): void {
  atual = novo;
}
