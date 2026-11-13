import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Table } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import { veiculosApi } from '../../services/api/veiculosApi';
import type { Veiculo } from '../../types/veiculo';
import { cn } from '../../utils/cn';

/** O que o Solicitante recebe da API: só dados não sensíveis (sem placa e sem km). */
type VeiculoDisponivel = Pick<Veiculo, 'id' | 'modelo' | 'capacidade_maxima' | 'tipo_frota'>;

const LABEL_FROTA: Record<string, string> = {
  ADMINISTRATIVA: 'Administrativa',
  SVO: 'SVO',
};

/**
 * Consulta de veículos para quem não gerencia a frota (Solicitante): lista só os disponíveis,
 * com modelo, capacidade e frota. A API já devolve a lista filtrada e sem dados sensíveis.
 */
export function VeiculosDisponiveis() {
  const [veiculos, setVeiculos] = useState<VeiculoDisponivel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await veiculosApi.listar();
      // Só os campos permitidos, mesmo que a API devolva algo a mais
      setVeiculos(
        lista.map(({ id, modelo, capacidade_maxima, tipo_frota }) => ({
          id,
          modelo,
          capacidade_maxima,
          tipo_frota,
        })),
      );
      setErro(null);
    } catch (error) {
      setVeiculos([]);
      setErro(mensagemDeErro(error));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="grid gap-6">
      {erro && (
        <Alert tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{erro}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void carregar()}
              disabled={carregando}
            >
              Tentar novamente
            </Button>
          </div>
        </Alert>
      )}

      <Card>
        <div className="border-b border-divider px-3.5 py-3 md:px-6">
          <h2 className="text-[15px] font-bold text-text md:text-base">Veículos disponíveis</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Veículos da frota disponíveis para atender às solicitações de viagem.
          </p>
        </div>

        <div aria-busy={carregando}>
          <Table>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Capacidade</th>
                <th>Frota</th>
              </tr>
            </thead>
            <tbody>
              {veiculos.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-9 text-center text-slate-500">
                    {carregando
                      ? 'Carregando veículos...'
                      : erro
                        ? 'Não foi possível exibir os veículos.'
                        : 'Nenhum veículo disponível no momento.'}
                  </td>
                </tr>
              ) : (
                veiculos.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong className="font-semibold text-slate-900">{v.modelo}</strong>
                    </td>
                    <td>
                      {v.capacidade_maxima} {v.capacidade_maxima === 1 ? 'lugar' : 'lugares'}
                    </td>
                    <td>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-[11px] font-bold',
                          v.tipo_frota === 'SVO'
                            ? 'bg-purple-bg text-purple'
                            : 'bg-neutral-bg text-slate-900',
                        )}
                      >
                        {LABEL_FROTA[v.tipo_frota] ?? v.tipo_frota}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
