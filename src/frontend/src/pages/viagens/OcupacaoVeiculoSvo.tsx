import { Alert, Badge } from '../../components/ui';
import type { BadgeTone } from '../../components/ui';
import type { OcupacaoVeiculoSvo } from '../../types/veiculo';

/**
 * Motivo pelo qual o veículo SVO não pode receber uma nova alocação (BL30 / RNF10),
 * ou null quando a alocação pode ocorrer. Espelha as regras do backend (criarOrdemSvo).
 */
export function motivoBloqueioSvo(veiculo: OcupacaoVeiculoSvo): string | null {
  if (veiculo.status === 'MANUTENCAO') {
    return 'O veículo está em manutenção e não pode receber alocações.';
  }
  if (veiculo.status === 'EM_USO') {
    return 'O veículo está em deslocamento e não pode receber novas alocações até a conclusão da ordem.';
  }
  if (veiculo.vagas_disponiveis <= 0) {
    return `Veículo lotado: ${veiculo.capacidade_utilizada} de ${veiculo.capacidade_maxima} vagas ocupadas. Escolha outro veículo ou aguarde a conclusão de uma ordem em andamento.`;
  }
  return null;
}

export const rotuloOcupacao = (veiculo: OcupacaoVeiculoSvo) =>
  `${veiculo.capacidade_utilizada}/${veiculo.capacidade_maxima} vagas ocupadas`;

function toneOcupacao(veiculo: OcupacaoVeiculoSvo): BadgeTone {
  if (motivoBloqueioSvo(veiculo)) return 'danger';
  if (veiculo.capacidade_utilizada > 0) return 'warning';
  return 'success';
}

interface OcupacaoVeiculoSvoProps {
  veiculo: OcupacaoVeiculoSvo;
  apenasInformativo?: boolean;
}

export function OcupacaoVeiculoSvoPainel({ veiculo, apenasInformativo = false }: OcupacaoVeiculoSvoProps) {
  const bloqueio = motivoBloqueioSvo(veiculo);
  const percentual =
    veiculo.capacidade_maxima > 0
      ? Math.min(100, Math.round((veiculo.capacidade_utilizada / veiculo.capacidade_maxima) * 100))
      : 100;

  return (
    <div className="mt-3.5" data-testid="ocupacao-svo">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-slate-700">Ocupação atual</span>
        <Badge tone={toneOcupacao(veiculo)}>{rotuloOcupacao(veiculo)}</Badge>
      </div>
      <div
        className="barra-indicador h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Ocupação do veículo"
        aria-valuemin={0}
        aria-valuemax={veiculo.capacidade_maxima}
        aria-valuenow={veiculo.capacidade_utilizada}
        aria-valuetext={rotuloOcupacao(veiculo)}
      >
        <div
          className={bloqueio && !apenasInformativo ? 'h-full bg-danger' : 'h-full bg-primary'}
          style={{ width: `${percentual}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {Math.max(veiculo.vagas_disponiveis, 0)} vaga(s) disponível(is)
      </p>
      {bloqueio && !apenasInformativo && (
        <Alert tone="danger" title="Alocação bloqueada" className="mt-3">
          {bloqueio}
        </Alert>
      )}
    </div>
  );
}
