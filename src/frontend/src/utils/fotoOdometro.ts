/**
 * Validação preventiva da foto do odômetro (SCRUM-203/214). O servidor continua sendo quem
 * decide: aqui só se evita enviar um arquivo que com certeza seria recusado.
 */

/** Limite proposto no contrato (docs/scrum-203-contrato-backend.md). */
export const TAMANHO_MAXIMO_FOTO_MB = 10;
const TAMANHO_MAXIMO_FOTO = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;

export const TIPOS_FOTO_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DESCRICAO_FORMATOS = 'JPG, PNG ou WebP';

type FormatoDetectado = 'image/jpeg' | 'image/png' | 'image/webp' | 'heic' | null;

function lerInicio(arquivo: Blob, bytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(new Uint8Array(leitor.result as ArrayBuffer));
    leitor.onerror = () => reject(leitor.error ?? new Error('Falha ao ler o arquivo'));
    leitor.readAsArrayBuffer(arquivo.slice(0, bytes));
  });
}

const texto = (b: Uint8Array, inicio: number, fim: number) =>
  String.fromCharCode(...b.slice(inicio, fim));

/** Formato pelo conteúdo do arquivo (assinatura), e não pelo nome ou pelo tipo informado. */
export function detectarFormato(b: Uint8Array): FormatoDetectado {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) {
    return 'image/png';
  }
  if (b.length >= 12 && texto(b, 0, 4) === 'RIFF' && texto(b, 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && texto(b, 4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(texto(b, 8, 12))) {
    return 'heic';
  }
  return null;
}

/** Mensagem do problema, ou `null` se a foto pode ser enviada. */
export async function validarFotoOdometro(arquivo: File): Promise<string | null> {
  if (arquivo.size === 0) return 'O arquivo está vazio. Escolha outra foto.';
  if (arquivo.size > TAMANHO_MAXIMO_FOTO) {
    return `A foto tem mais de ${TAMANHO_MAXIMO_FOTO_MB} MB. Tire outra foto ou escolha um arquivo menor.`;
  }

  let formato: FormatoDetectado;
  try {
    formato = detectarFormato(await lerInicio(arquivo, 12));
  } catch {
    return 'Não foi possível ler a foto. Tente escolher de novo.';
  }

  if (formato === 'heic') {
    return `Fotos em HEIC não são aceitas. Envie em ${DESCRICAO_FORMATOS}. No iPhone: Ajustes > Câmera > Formatos > Mais Compatível.`;
  }
  if (formato === null) {
    return `O arquivo não é uma imagem válida. Envie uma foto em ${DESCRICAO_FORMATOS}.`;
  }
  return null;
}

/**
 * Saída e chegada registradas pelo backend como `INICIOU_VIAGEM tipo=SVO id=12 ...` e
 * `FINALIZOU_VIAGEM ...`: a viagem de origem das fotos do odômetro (SCRUM-207).
 */
export function viagemDoRegistro(acao: string): { tipo_operacao: 'ADMINISTRATIVA' | 'SVO'; id: number } | null {
  const achado = /^(?:INICIOU|FINALIZOU)_VIAGEM tipo=(ADMINISTRATIVA|SVO) id=(\d+)(?:\s|$)/.exec(acao);
  return achado ? { tipo_operacao: achado[1] as 'ADMINISTRATIVA' | 'SVO', id: Number(achado[2]) } : null;
}

/** Chave para o servidor reconhecer o reenvio da mesma foto e não duplicar a evidência. */
export function novaChaveIdempotencia(): string {
  const cripto = globalThis.crypto as Crypto | undefined;
  if (cripto?.randomUUID) return cripto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
