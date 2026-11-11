import { cn } from '../../utils/cn';

export interface PlacaMercosulProps {
  placa: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function PlacaMercosul({ placa, className, size = 'md' }: PlacaMercosulProps) {
  const isSm = size === 'sm';

  return (
    <div
      className={cn(
        'inline-flex shrink-0 flex-col overflow-hidden rounded-md border border-slate-900 bg-white shadow-2xs select-none',
        isSm ? 'h-7 w-[64px]' : 'h-9 w-[78px]',
        className,
      )}
      title={`Placa: ${placa}`}
      aria-label={`Placa do veículo ${placa}`}
    >
      {/* Faixa azul superior Mercosul */}
      <div
        className={cn(
          'flex w-full shrink-0 items-center justify-center bg-[#194b91] px-1',
          isSm ? 'h-2.5' : 'h-3.5',
        )}
      >
        <span
          className={cn(
            'font-sans font-black tracking-widest text-white uppercase leading-none select-none',
            isSm ? 'text-[5.5px]' : 'text-[6.5px]',
          )}
        >
          BRASIL
        </span>
      </div>

      {/* Caracteres da placa em preto, fonte mono pesada */}
      <div
        className={cn(
          'flex flex-1 items-center justify-center bg-white px-0.5 font-mono font-black tracking-widest text-slate-950 uppercase leading-none',
          isSm ? 'text-[10px]' : 'text-[12px]',
        )}
      >
        {placa}
      </div>
    </div>
  );
}

