import { useState } from 'react';
import { Accessibility } from 'lucide-react';
import { Modal } from '../ui';
import { cn } from '../../utils/cn';
import { SecaoAcessibilidade } from './SecaoAcessibilidade';

/**
 * Acesso às preferências de acessibilidade em telas sem login (entrada no sistema e, depois, o portal público
 * da SCRUM-265). Nas áreas com login, a seção fica nas preferências do aplicativo.
 */
export function BotaoAcessibilidade({ className, superficie = 'escura' }: {
  className?: string;
  superficie?: 'clara' | 'escura';
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAberto(true)}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-sans text-sm font-semibold',
          superficie === 'clara'
            ? 'border-border-strong bg-surface text-text hover:bg-surface-alt'
            : 'border-white/20 bg-white/10 text-white hover:bg-white/20',
          className,
        )}
      >
        <Accessibility size={18} aria-hidden="true" />
        Acessibilidade
      </button>
      <Modal isOpen={aberto} title="Acessibilidade" onClose={() => setAberto(false)} maxWidth={560}>
        <SecaoAcessibilidade sozinha />
      </Modal>
    </>
  );
}
