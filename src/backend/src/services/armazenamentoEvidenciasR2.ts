import { createHash } from 'node:crypto';
import { addAbortSignal, Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { env } from '../config/env';
import { AppError } from '../errors/AppError';
import type { ArmazenamentoEvidencias } from './armazenamentoEvidencias';
import { limiteLeituraEvidencia, validarChave } from './chavesEvidencias';

type ConfiguracaoR2 = NonNullable<typeof env.evidenciasR2>;

function codigoHttp(erro: unknown): number | undefined {
  return (erro as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
}

export function armazenamentoR2(config: ConfiguracaoR2, cliente = new S3Client({
  endpoint: config.endpoint,
  region: 'auto',
  credentials: config.credenciais,
  forcePathStyle: true,
  maxAttempts: 1,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})): ArmazenamentoEvidencias {
  async function ler(chave: string, maxBytes = limiteLeituraEvidencia, sinal = AbortSignal.timeout(config.timeoutMs)): Promise<Buffer> {
    const key = validarChave(chave);
    try {
      const resposta = await cliente.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: sinal });
      const fluxo = resposta.Body;
      if (!(fluxo instanceof Readable)) throw new Error('Corpo R2 inválido');
      addAbortSignal(sinal, fluxo);
      try {
        if (resposta.ContentLength !== undefined && resposta.ContentLength > maxBytes) {
          throw new AppError('Tamanho do objeto de evidência inválido', 502);
        }
        const partes: Buffer[] = [];
        let tamanho = 0;
        for await (const parte of fluxo) {
          const bytes = Buffer.from(parte);
          tamanho += bytes.length;
          if (tamanho > maxBytes) throw new AppError('Tamanho do objeto de evidência inválido', 502);
          partes.push(bytes);
        }
        if (resposta.ContentLength !== undefined && resposta.ContentLength !== tamanho) {
          throw new AppError('Tamanho do objeto de evidência inválido', 502);
        }
        return Buffer.concat(partes, tamanho);
      } finally {
        fluxo.destroy();
      }
    } catch (erro) {
      if (erro instanceof AppError) throw erro;
      if (codigoHttp(erro) === 404 && (erro as Error).name === 'NoSuchKey') {
        throw new AppError('O arquivo da foto não foi encontrado no armazenamento', 404);
      }
      throw indisponivel();
    }
  }

  return {
    ler,
    async salvar(chave, conteudo, tipo) {
      const key = validarChave(chave);
      const sinal = AbortSignal.timeout(config.timeoutMs);
      try {
        await cliente.send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: conteudo,
          ContentType: tipo,
          ContentLength: conteudo.length,
          CacheControl: 'private, no-store',
          IfNoneMatch: '*',
          Metadata: { sha256: createHash('sha256').update(conteudo).digest('hex') },
        }), { abortSignal: sinal });
      } catch (erro) {
        if (codigoHttp(erro) !== 412) throw indisponivel();
        const existente = await ler(key, limiteLeituraEvidencia, sinal);
        if (!existente.equals(conteudo)) {
          throw new AppError('Esta chave já está associada a outro conteúdo', 409);
        }
      }
    },
    async remover(chave) {
      const key = validarChave(chave);
      try {
        await cliente.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(config.timeoutMs) });
      } catch {
        throw indisponivel();
      }
    },
  };
}

function indisponivel(): AppError {
  return new AppError('Armazenamento de evidências indisponível', 503, 'EVIDENCIAS_STORAGE_INDISPONIVEL');
}
