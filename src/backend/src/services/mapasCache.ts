const TTL_MAPAS_MS = 24 * 60 * 60 * 1000;
const MEMORIA_MAPAS_BYTES = 8 * 1024 * 1024;
const CUSTO_BASE_ENTRADA = 256;

export class CacheMapas<T> {
  private readonly entradas = new Map<string, { valor: T; expiraEm: number; bytes: number }>();
  private totalBytes = 0;

  constructor(private readonly maxEntradas: number, private readonly relogio = Date.now,
    private readonly maxBytes = MEMORIA_MAPAS_BYTES) {}

  obter(chave: string): T | undefined {
    const entrada = this.entradas.get(chave);
    if (!entrada) return undefined;
    if (entrada.expiraEm <= this.relogio()) {
      this.remover(chave);
      return undefined;
    }
    this.entradas.delete(chave);
    this.entradas.set(chave, entrada);
    return entrada.valor;
  }

  guardar(chave: string, valor: T): number {
    // Estimativa conservadora do objeto em memória, com margem sobre sua representação serializada.
    const bytes = CUSTO_BASE_ENTRADA + chave.length * 2 + Buffer.byteLength(JSON.stringify(valor)) * 3;
    if (bytes > this.maxBytes) return 0;
    this.remover(chave);
    let eviccoes = 0;
    for (const antiga of this.entradas.keys()) {
      if (this.entradas.size < this.maxEntradas && this.totalBytes + bytes <= this.maxBytes) break;
      this.remover(antiga);
      eviccoes++;
    }
    this.entradas.set(chave, { valor, bytes, expiraEm: this.relogio() + TTL_MAPAS_MS });
    this.totalBytes += bytes;
    return eviccoes;
  }

  private remover(chave: string) {
    const entrada = this.entradas.get(chave);
    if (!entrada) return;
    this.entradas.delete(chave);
    this.totalBytes -= entrada.bytes;
  }
}
