import { useNavigate } from 'react-router-dom';
import { Alert, EmptyState } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { Carregando, ErroDeCarga } from './comuns';
import { dataPorExtenso } from './formatarQuando';
import { JanelasViagem } from './JanelasViagem';
import { LinhasViagem } from './LinhasViagem';
import { ProximaEDepois } from './ProximaEDepois';
import { useViagensMotorista } from './useViagensMotorista';

const MAXIMO_LINHAS = 3;

/** Início do motorista no celular: a viagem de agora (ou a próxima) com a ação do momento. */
export default function MotoristaInicio() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const painel = useViagensMotorista();
  const { isSvo, grupos, carregando, erroCarga } = painel;
  const { agora, proximas, historico } = grupos;

  const emCurso = agora.length > 0;
  const destaque = emCurso ? agora : proximas.slice(0, 1);
  const depois = emCurso ? proximas : proximas.slice(1);
  const nome = isSvo ? 'coleta' : 'viagem';

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="px-1 pt-1 [@media(max-height:500px)]:hidden">
        <p className="m-0 text-xl leading-tight text-text-strong">
          Olá, <strong className="text-text">{usuario?.nome?.split(' ')[0] ?? 'motorista'}</strong>
        </p>
        <p className="m-0 mt-0.5 text-sm text-neutral first-letter:uppercase">{dataPorExtenso()}</p>
      </div>

      {painel.coletasDesabilitadas && (
        <Alert tone="info">As operações de coleta SVO estão desabilitadas neste ambiente.</Alert>
      )}

      {carregando ? (
        <Carregando texto="Carregando suas viagens..." />
      ) : (
        <>
          {erroCarga && <ErroDeCarga mensagem={erroCarga} onTentar={() => void painel.recarregar()} />}

          {destaque.length === 0 && !erroCarga && (
            <div className="my-auto flex flex-col gap-4">
              <EmptyState
                title={`Nenhuma ${nome} para você agora`}
                description="Quando o gestor agendar, ela aparece aqui."
                className="bg-surface py-10"
              />
              {historico.length > 0 && (
                <LinhasViagem
                  titulo={`Últimas ${nome === 'coleta' ? 'coletas' : 'viagens'}`}
                  viagens={historico.slice(0, MAXIMO_LINHAS)}
                  onAbrir={painel.abrirDetalhes}
                />
              )}
            </div>
          )}

          {destaque.length > 0 && (
            <ProximaEDepois
              painel={painel}
              titulo={emCurso ? `${isSvo ? 'Coleta' : 'Viagem'} em andamento` : `Próxima ${nome}`}
              destaque={destaque}
              tituloDepois={emCurso ? 'Próximas' : 'Mais tarde'}
              depois={depois.slice(0, MAXIMO_LINHAS)}
              rodapeDepois={
                depois.length > MAXIMO_LINHAS && (
                  <button
                    type="button"
                    className="min-h-12 w-full border-t border-divider text-sm font-semibold text-primary active:bg-surface-hover"
                    onClick={() => navigate('/viagens')}
                  >
                    Ver todas ({depois.length})
                  </button>
                )
              }
            />
          )}
        </>
      )}

      <JanelasViagem painel={painel} />
    </div>
  );
}
