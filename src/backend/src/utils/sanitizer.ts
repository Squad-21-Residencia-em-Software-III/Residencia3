const SENSITIVE_KEYS = ['senha', 'password', 'token', 'authorization', 'secret', 'cpf', 'cnh', 'rg', 'cartao', 'credencial', 'telefone', 'celular', 'email',];

export function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof data[key] === 'object') {
      sanitized[key] = sanitizeData(data[key]);
    } else {
      sanitized[key] = data[key];
    }
  }
  return sanitized;
}