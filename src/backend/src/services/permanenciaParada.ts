import { coordenadasSchema, type CoordenadasMapa } from '../validators/mapasSchemas';

interface Identidade {
  viagemId: number;
  motoristaId: number;
  paradaId: number;
  versaoRoteiro: number;
}
interface Amostra extends Identidade {
  tipo: 'GPS_REAL' | 'ESTIMATIVA' | 'LACUNA';
  coordenadas: CoordenadasMapa | null;
  precisaoMetros: number | null;
  capturadoEm: number;
  recebidoEm: number;
}

const CINCO_MINUTOS_MS = 5 * 60_000;
const UM_MINUTO_MS = 60_000;
const RAIO_METROS = 100;
const rad = (graus: number) => graus * Math.PI / 180;

function distanciaMetros(a: CoordenadasMapa, b: CoordenadasMapa): number {
  const seno = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, seno))));
}

export function avaliarPermanenciaParada(contexto: {
  habilitada: boolean;
  operacao: 'ADMINISTRATIVA' | 'SVO';
  parada: Identidade & { coordenadas: CoordenadasMapa; pendente: boolean };
  pedido: Identidade & { registradoEm: number; respondido: boolean };
  agora: number;
  amostras: readonly Amostra[];
  parametros?: { intervaloMaximoMs: number; precisaoMaximaMetros: number };
}): Amostra | null {
  const { operacao, parada, pedido, agora, parametros } = contexto;
  const mesmoVinculo = (item: Identidade) => item.viagemId === parada.viagemId &&
    item.motoristaId === parada.motoristaId && item.paradaId === parada.paradaId &&
    item.versaoRoteiro === parada.versaoRoteiro;

  if (!contexto.habilitada || operacao !== 'ADMINISTRATIVA' || !parada.pendente || pedido.respondido ||
      !mesmoVinculo(pedido) || !Number.isFinite(agora) || !Number.isFinite(pedido.registradoEm) ||
      agora - pedido.registradoEm < CINCO_MINUTOS_MS || !coordenadasSchema.safeParse(parada.coordenadas).success ||
      !parametros || !Number.isFinite(parametros.precisaoMaximaMetros) || parametros.precisaoMaximaMetros <= 0 ||
      !Number.isFinite(parametros.intervaloMaximoMs) || parametros.intervaloMaximoMs <= 0 ||
      parametros.intervaloMaximoMs >= UM_MINUTO_MS) return null;

  let inicio: number | undefined;
  let anterior: number | undefined;
  let confirmacao: Amostra | null = null;
  for (const ponto of contexto.amostras) {
    const { coordenadas, precisaoMetros, capturadoEm, recebidoEm } = ponto;
    if (!mesmoVinculo(ponto) || !Number.isFinite(capturadoEm) || !Number.isFinite(recebidoEm) ||
        recebidoEm > agora || capturadoEm > recebidoEm || (anterior !== undefined && capturadoEm <= anterior)) return null;

    if (ponto.tipo !== 'GPS_REAL' || !coordenadas || !coordenadasSchema.safeParse(coordenadas).success ||
        precisaoMetros === null || !Number.isFinite(precisaoMetros) || precisaoMetros < 0 ||
        precisaoMetros > parametros.precisaoMaximaMetros || distanciaMetros(coordenadas, parada.coordenadas) + precisaoMetros > RAIO_METROS ||
        capturadoEm < pedido.registradoEm) {
      inicio = undefined;
    } else {
      if (inicio === undefined || anterior === undefined || capturadoEm - anterior > parametros.intervaloMaximoMs) {
        inicio = capturadoEm;
      }
      if (capturadoEm - inicio >= UM_MINUTO_MS && confirmacao === null) confirmacao = ponto;
    }
    anterior = capturadoEm;
  }
  return confirmacao;
}
