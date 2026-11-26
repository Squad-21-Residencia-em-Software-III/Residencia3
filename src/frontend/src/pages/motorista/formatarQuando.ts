import type { Abastecimento } from '../../types/abastecimento';

const dois = (n: number) => String(n).padStart(2, '0');

/** "Hoje, 14:30", "Amanhã, 08:00", "Ontem, 17:15" ou "25/11, 08:00"; vazio sem horário. */
export function formatarQuando(iso?: string | null, agora = new Date()): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const hora = `${dois(data.getHours())}:${dois(data.getMinutes())}`;
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diferenca = (dia(data) - dia(agora)) / 86_400_000;
  if (diferenca === 0) return `Hoje, ${hora}`;
  if (diferenca === 1) return `Amanhã, ${hora}`;
  if (diferenca === -1) return `Ontem, ${hora}`;
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}, ${hora}`;
}

/** "segunda-feira, 23 de novembro". */
export const dataPorExtenso = (data = new Date()): string =>
  data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export const reais = (valor: number): string =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dataCurta = (iso: string): string =>
  iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');

export const emLitros = (valor: number | string): string =>
  `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;

/** "22/10 · 40,5 L · R$ 242,60". */
export const resumoAbastecimento = (a: Abastecimento): string =>
  [dataCurta(a.data_abastecimento), emLitros(a.litros), reais(Number(a.valor_total))].join(' · ');

/** Data local de hoje em AAAA-MM-DD (o `toISOString` viraria o dia às 21h, por usar UTC). */
export function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}
