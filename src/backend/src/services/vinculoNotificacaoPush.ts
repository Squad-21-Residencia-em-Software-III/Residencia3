import { createHmac } from 'node:crypto';
import { env } from '../config/env';

/** Identifica a assinatura atual no payload sem expor o endpoint, as chaves ou o titular. */
export function identificarVinculoPush({ endpoint, p256dh, auth }: {
  endpoint: string; p256dh: string; auth: string;
}): string {
  return createHmac('sha256', env.jwtSecret)
    .update(JSON.stringify(['fsph-push-v1', endpoint, p256dh, auth])).digest('base64url');
}
