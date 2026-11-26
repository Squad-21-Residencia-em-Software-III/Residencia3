import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Fuel, Gauge, MapPin, Truck, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PlacaMercosul, type BadgeTone } from '../../components/ui';
import { recursoAtivo } from '../../config/recursosBackend';
import { abastecimentosApi } from '../../services/api/abastecimentosApi';
import { mensagemDeErro } from '../../services/api/http';
import { veiculosApi } from '../../services/api/veiculosApi';
import { viagensApi } from '../../services/api/viagensApi';
import type { Abastecimento } from '../../types/abastecimento';
import type { StatusVeiculo, Veiculo } from '../../types/veiculo';
import { rotuloStatusViagem, viagemEmCurso, type Viagem } from '../../types/viagem';
import { cn } from '../../utils/cn';
import { usePermissao } from '../../utils/permissoes';
import { BOTAO_GRANDE, BOTAO_PRINCIPAL, Carregando, ErroDeCarga } from './comuns';
import { formatarQuando, resumoAbastecimento } from './formatarQuando';

const STATUS: Record<StatusVeiculo, { rotulo: string; tom: BadgeTone }> = {
  DISPONIVEL: { rotulo: 'Disponível', tom: 'success' },
  RESERVADO: { rotulo: 'Reservado', tom: 'warning' },
  EM_USO: { rotulo: 'Em uso', tom: 'info' },
  MANUTENCAO: { rotulo: 'Manutenção', tom: 'danger' },
};

const partida = (v: Viagem) => (v.inicio_previsto ? new Date(v.inicio_previsto).getTime() : Infinity);

/** Viagem em andamento com o veículo ou, sem ela, a próxima. */
function viagemDoVeiculo(viagens: Viagem[], veiculoId: number): Viagem | undefined {
  const doVeiculo = viagens.filter((v) => v.veiculo_id === veiculoId);
  return (
    doVeiculo.find((v) => viagemEmCurso(v.status)) ??
    doVeiculo.filter((v) => v.status === 'AGENDADA').sort((a, b) => partida(a) - partida(b) || a.id - b.id)[0]
  );
}

/** Veículos das viagens ativas do motorista (a API só lista os dele). */
export default function MotoristaVeiculo() {
  const navigate = useNavigate();
  const { podeNaFrota } = usePermissao();
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const frota = await veiculosApi.listar();
      setVeiculos(frota);
      setErroCarga(null);
      // Complementos: se um falhar, o veículo continua na tela
      const [lista, historico] = await Promise.allSettled([
        viagensApi.listar(),
        abastecimentosApi.listarTodos(frota.map((v) => v.id)),
      ]);
      if (lista.status === 'fulfilled') setViagens(lista.value);
      if (historico.status === 'fulfilled') setAbastecimentos(historico.value);
    } catch (e) {
      setErroCarga(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return <Carregando texto="Carregando veículo..." />;
  if (erroCarga) return <ErroDeCarga mensagem={erroCarga} onTentar={() => void carregar()} />;
  if (veiculos.length === 0) {
    return (
      <EmptyState
        icon={<Truck size={24} />}
        title="Nenhum veículo com você"
        description="O veículo aparece aqui quando você tem uma viagem agendada ou em andamento."
        className="my-auto bg-surface py-12"
      />
    );
  }

  const sozinho = veiculos.length === 1;

  return (
    <div className={cn('flex flex-col gap-3', sozinho ? 'flex-1 justify-center' : 'my-auto')}>
      {veiculos.map((v) => {
        const status = STATUS[v.status] ?? { rotulo: v.status, tom: 'neutral' as const };
        const viagem = viagemDoVeiculo(viagens, v.id);
        const ultimo = abastecimentos.find((a) => a.veiculo_id === v.id);
        return (
          <Card
            key={v.id}
            className={cn('flex flex-col gap-3 p-4', sozinho && 'max-h-[580px] flex-1 justify-between')}
          >
            <div
              className={cn(
                'flex items-center gap-3',
                sozinho &&
                  '[@media(min-height:600px)]:flex-col [@media(min-height:600px)]:gap-2.5 [@media(min-height:600px)]:pt-2',
              )}
            >
              <PlacaMercosul
                placa={v.placa}
                className={cn(sozinho && '[@media(min-height:600px)]:my-2 [@media(min-height:600px)]:scale-140')}
              />
              <h2
                className={cn(
                  'min-w-0 flex-1 truncate text-[17px] font-bold',
                  sozinho &&
                    '[@media(min-height:600px)]:mt-2 [@media(min-height:600px)]:max-w-full [@media(min-height:600px)]:flex-none [@media(min-height:600px)]:text-xl',
                )}
              >
                {v.modelo}
              </h2>
              <Badge tone={status.tom}>{status.rotulo}</Badge>
            </div>

            <dl className="m-0 grid grid-cols-2 gap-2">
              <Numero rotulo="Km atual" icone={<Gauge size={15} aria-hidden="true" />}>
                {v.km_atual.toLocaleString('pt-BR')}
              </Numero>
              <Numero
                rotulo={v.tipo_frota === 'SVO' ? 'Corpos (máx.)' : 'Lugares'}
                icone={<Users size={15} aria-hidden="true" />}
              >
                {v.capacidade_maxima}
              </Numero>
              {v.tipo_frota === 'SVO' && recursoAtivo('lotacaoCabine') && (
                <Numero rotulo="Pessoas na cabine" className="col-span-2">
                  {v.lotacao_cabine ?? 'Não informada'}
                </Numero>
              )}
            </dl>

            {(viagem || ultimo) && (
              <div className="flex flex-col divide-y divide-divider border-y border-divider">
                {viagem && (
                  <button
                    type="button"
                    className="flex min-h-15 w-full items-center gap-3 py-2 text-left active:bg-surface-hover"
                    onClick={() => navigate('/viagens')}
                  >
                    <MapPin size={20} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-sans text-sm text-neutral">
                        {[
                          rotuloStatusViagem(viagem),
                          formatarQuando(viagem.data_hora_efetiva_saida ?? viagem.inicio_previsto),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="block truncate text-[15px] font-semibold text-text">
                        {viagem.destino ?? 'Destino não informado'}
                      </span>
                    </span>
                    <ChevronRight size={20} className="shrink-0 text-text-subtle" aria-hidden="true" />
                  </button>
                )}
                {ultimo && (
                  <div className="flex min-h-15 items-center gap-3 py-2">
                    <Fuel size={20} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-neutral">Último abastecimento</span>
                      <span className="block truncate font-display text-[15px] font-semibold text-text">
                        {resumoAbastecimento(ultimo)}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {podeNaFrota('abastecimentos.registrar', v.tipo_frota) && (
              <Button
                className={sozinho ? BOTAO_PRINCIPAL : BOTAO_GRANDE}
                onClick={() => navigate('/abastecimento', { state: { veiculoId: v.id } })}
              >
                <Fuel size={20} aria-hidden="true" /> Abastecer
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Numero({
  rotulo,
  icone,
  className,
  children,
}: {
  rotulo: string;
  icone?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-md bg-surface-alt p-3', className)}>
      <dt className="flex items-center gap-1.5 text-sm text-neutral">
        {icone} {rotulo}
      </dt>
      <dd className="m-0 mt-0.5 font-display text-xl font-bold text-text">{children}</dd>
    </div>
  );
}
