import { z } from 'zod';

// Alertas no aparelho (SCRUM-237). Os limites repetem os CHECKs de push_subscriptions (SCRUM-236), para a
// recusa ser 400 com o campo, e não erro do banco.
const BASE64URL = /^[A-Za-z0-9+/_=-]+$/;
// Espaço, controle e barra invertida: um endpoint de navegador nunca tem
const CARACTERE_PROIBIDO = /[\s\u0000-\u001f\u007f\\]/;

/**
 * O endpoint vem do cliente e a API faz uma requisição para ele: só serviços de push conhecidos (sem isso,
 * qualquer pessoa logada faria a API chamar um endereço da rede interna). `*.dominio` aceita subdomínios.
 */
export function hostPushPermitido(endpoint: string, hosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase();
  return hosts.some((permitido) =>
    permitido.startsWith('*.') ? host.endsWith(permitido.slice(1)) && host.length > permitido.length - 1 : host === permitido
  );
}

const endpointSchema = z
  .string()
  .min(16)
  .max(2048)
  .refine((valor) => valor.startsWith('https://') && !CARACTERE_PROIBIDO.test(valor), {
    message: 'Endereço de assinatura inválido',
  });

export const criarSchemasPush = (hostsPermitidos: readonly string[]) => {
  const endpointPermitido = endpointSchema.refine((valor) => hostPushPermitido(valor, hostsPermitidos), {
    message: 'Serviço de alertas do navegador não reconhecido',
  });
  return {
    assinatura: z
      .object({
        endpoint: endpointPermitido,
        keys: z
          .object({
            p256dh: z.string().min(16).max(512).regex(BASE64URL),
            auth: z.string().min(8).max(256).regex(BASE64URL),
          })
          .strict(),
      })
      .strict()
      .refine(({ keys }) => keys.p256dh !== keys.auth, { message: 'Chaves da assinatura inválidas', path: ['keys'] }),
  };
};

// Situação e cancelamento só leem o banco: qualquer endpoint bem formado vale (inclusive de um host que deixou de ser aceito)
export const endpointPushSchema = z.object({ endpoint: endpointSchema }).strict();

export const codigoCategoriaSchema = z.object({ codigo: z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/) });

export const preferenciaPushSchema = z.object({ push: z.boolean() }).strict();
