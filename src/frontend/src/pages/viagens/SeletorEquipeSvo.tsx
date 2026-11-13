import type { ChangeEvent } from 'react';
import { Alert, Select } from '../../components/ui';
import type { EquipeSvo } from '../../types/equipeSvo';

interface SeletorEquipeSvoProps {
  equipes: EquipeSvo[];
  carregando: boolean;
  erro: string | null;
  /** id da equipe escolhida; string vazia = sem equipe definida */
  valor: string;
  onChange: (equipeId: string) => void;
}

/**
 * Escolha da equipe do SVO na alocação da ordem (BL29).
 * A equipe é opcional no backend: sem equipe, a ordem é alocada só com veículo e motorista.
 * Equipes indisponíveis aparecem desabilitadas para o gestor entender o motivo.
 */
export function SeletorEquipeSvo({ equipes, carregando, erro, valor, onChange }: SeletorEquipeSvoProps) {
  if (carregando) {
    return (
      <div className="mt-3.5 flex items-center gap-2 text-xs text-slate-500" data-testid="equipes-carregando">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
        Carregando equipes do SVO...
      </div>
    );
  }

  if (erro) {
    return (
      <Alert tone="warning" className="mt-3.5">
        Não foi possível carregar as equipes: {erro}. Você ainda pode alocar a ordem sem equipe.
      </Alert>
    );
  }

  const disponiveis = equipes.filter((e) => e.disponivel).length;

  return (
    <div className="mt-3.5">
      <Select
        label="Equipe SVO (opcional)"
        value={valor}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      >
        <option value="">Sem equipe definida</option>
        {equipes.map((equipe) => (
          <option key={equipe.id} value={equipe.id} disabled={!equipe.disponivel}>
            {equipe.nome_equipe}
            {equipe.disponivel ? '' : ' — indisponível'}
          </option>
        ))}
      </Select>
      {equipes.length === 0 ? (
        <p className="-mt-2 text-xs text-slate-500">Nenhuma equipe cadastrada.</p>
      ) : disponiveis === 0 ? (
        <Alert tone="warning" className="mt-1">
          Nenhuma equipe disponível no momento. A ordem pode ser alocada sem equipe.
        </Alert>
      ) : (
        <p className="-mt-2 text-xs text-slate-500">{disponiveis} equipe(s) disponível(is).</p>
      )}
    </div>
  );
}
