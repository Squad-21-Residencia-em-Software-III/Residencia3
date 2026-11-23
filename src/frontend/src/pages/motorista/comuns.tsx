import { RefreshCw } from 'lucide-react';
import { Alert, Button } from '../../components/ui';
import type { Aviso } from './useAviso';

/** Botão do motorista no celular: 52 px de altura, para tocar com o polegar. */
export const BOTAO_GRANDE = 'min-h-13 w-full text-base';

/** Ação única da tela: 64 px onde a altura permite. */
export const BOTAO_PRINCIPAL =
  'min-h-13 w-full text-base [@media(min-height:600px)]:min-h-16 [@media(min-height:600px)]:text-lg';

export function AvisoFlutuante({ aviso, onFechar }: { aviso: Aviso | null; onFechar: () => void }) {
  if (!aviso) return null;
  return (
    <div className="fixed inset-x-3 top-16 z-40 mx-auto max-w-[536px]">
      <Alert tone={aviso.erro ? 'danger' : 'success'} onClose={onFechar} className="shadow-menu">
        {aviso.texto}
      </Alert>
    </div>
  );
}

export function Carregando({ texto }: { texto: string }) {
  return (
    <p role="status" className="my-auto py-10 text-center text-sm text-neutral">
      {texto}
    </p>
  );
}

export function ErroDeCarga({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div className="my-auto flex flex-col gap-3">
      <Alert tone="danger">{mensagem}</Alert>
      <Button variant="outline" className={BOTAO_GRANDE} onClick={onTentar}>
        <RefreshCw size={18} aria-hidden="true" /> Tentar novamente
      </Button>
    </div>
  );
}
