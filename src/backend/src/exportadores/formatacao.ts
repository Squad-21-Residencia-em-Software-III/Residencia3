import { FUSO_RELATORIOS } from '../constants/relatorios';
import type { TipoColuna } from './tipos';

export interface PartesDeData {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

const formatadorLocal = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_RELATORIOS,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

// Data e hora de um instante no fuso de operação (independe do fuso do servidor)
export function partesNoFusoLocal(instante: Date): PartesDeData {
  const partes = formatadorLocal.formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);

  return {
    ano: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: valor('hour'),
    minuto: valor('minute'),
    segundo: valor('second'),
  };
}

// Somente data, sem horário: instantes em texto ISO (com hora) seguem para a conversão de fuso
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// Colunas "data" chegam do banco como AAAA-MM-DD (texto); instantes chegam como Date
export function partesDaData(valor: unknown): PartesDeData | null {
  if (valor === null || valor === undefined || valor === '') return null;

  if (typeof valor === 'string') {
    const iso = DATA_ISO.exec(valor);
    if (iso) {
      return { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]), hora: 0, minuto: 0, segundo: 0 };
    }
  }

  const instante = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(instante.getTime()) ? null : partesNoFusoLocal(instante);
}

const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

export function numeroDoValor(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

// Texto exibido nas colunas de formato brasileiro (dd/mm/aaaa, vírgula decimal)
export function valorComoTexto(valor: unknown, tipo: TipoColuna): string {
  if (valor === null || valor === undefined) return '';

  if (tipo === 'data' || tipo === 'data_hora') {
    const partes = partesDaData(valor);
    if (!partes) return '';
    const data = `${doisDigitos(partes.dia)}/${doisDigitos(partes.mes)}/${partes.ano}`;
    return tipo === 'data' ? data : `${data} ${doisDigitos(partes.hora)}:${doisDigitos(partes.minuto)}`;
  }

  if (tipo === 'inteiro') {
    const numero = numeroDoValor(valor);
    return numero === null ? '' : String(Math.trunc(numero));
  }

  if (tipo === 'decimal') {
    const numero = numeroDoValor(valor);
    return numero === null ? '' : numero.toFixed(2).replace('.', ',');
  }

  return String(valor);
}

// Data de hoje (AAAA-MM-DD) no fuso de operação, usada no nome do arquivo
export function hojeNoFusoLocal(agora: Date = new Date()): string {
  const { ano, mes, dia } = partesNoFusoLocal(agora);
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

// Número de série do Excel (dias desde 1899-12-30) para a data/hora local, sem conversão de fuso
export function serialDoExcel(partes: PartesDeData): number {
  const ms = Date.UTC(partes.ano, partes.mes - 1, partes.dia, partes.hora, partes.minuto, partes.segundo);
  return ms / 86400000 + 25569;
}
