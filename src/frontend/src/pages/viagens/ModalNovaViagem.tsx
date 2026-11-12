import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Modal, Select } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import { veiculosApi } from '../../services/api/veiculosApi';
import type { Motorista, StatusMotorista } from '../../types/motorista';
import type { OcupacaoVeiculoSvo, StatusVeiculo, Veiculo } from '../../types/veiculo';
import type { SolicitacaoViagem } from '../../types/solicitacao';
import type { NovaViagemInput, TipoOperacaoViagem } from '../../types/viagem';
import { motivoBloqueioSvo, OcupacaoVeiculoSvoPainel, rotuloOcupacao } from './OcupacaoVeiculoSvo';

interface ModalNovaViagemProps {
  solicitacoesAprovadas: SolicitacaoViagem[];
  erroSolicitacoes?: string | null;
  veiculos: Veiculo[];
  motoristas: Motorista[];
  solicitacaoIdInicial?: number;
  onClose: () => void;
  onSalvar: (novaViagem: NovaViagemInput) => Promise<void>;
}

// Mesmos bloqueios do backend. RESERVADO/EM_USO e DESIGNADO/EM_VIAGEM continuam na lista
// porque podem atender outro período; o conflito de datas é validado pelo backend.
const VEICULO_BLOQUEADO: StatusVeiculo[] = ['MANUTENCAO'];
const MOTORISTA_BLOQUEADO: StatusMotorista[] = ['AFASTADO', 'INATIVO'];

const LABEL_OCUPADO: Partial<Record<StatusVeiculo | StatusMotorista, string>> = {
  RESERVADO: 'reservado',
  EM_USO: 'em uso',
  DESIGNADO: 'designado',
  EM_VIAGEM: 'em viagem',
};

const sufixoStatus = (status: StatusVeiculo | StatusMotorista) =>
  LABEL_OCUPADO[status] ? ` — ${LABEL_OCUPADO[status]}` : '';

export function ModalNovaViagem({
  solicitacoesAprovadas,
  erroSolicitacoes,
  veiculos,
  motoristas,
  solicitacaoIdInicial,
  onClose,
  onSalvar,
}: ModalNovaViagemProps) {
  const veiculosDoTipo = (tipo: TipoOperacaoViagem) =>
    veiculos.filter(
      (v) => v.tipo_frota === tipo && (tipo === 'SVO' || !VEICULO_BLOQUEADO.includes(v.status)),
    );
  const motoristasDoTipo = (tipo: TipoOperacaoViagem) =>
    motoristas.filter(
      (m) =>
        m.tipo_motorista === (tipo === 'SVO' ? 'SVO' : 'FROTA') &&
        !MOTORISTA_BLOQUEADO.includes(m.status),
    );

  const solicitacaoInicial =
    solicitacoesAprovadas.find((s) => s.id === solicitacaoIdInicial) ?? solicitacoesAprovadas[0];

  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacaoViagem>('ADMINISTRATIVA');
  const [solicitacaoId, setSolicitacaoId] = useState<string>(
    solicitacaoInicial ? String(solicitacaoInicial.id) : '',
  );
  const [veiculoId, setVeiculoId] = useState<string>(() => {
    const primeiro = veiculosDoTipo('ADMINISTRATIVA')[0];
    return primeiro ? String(primeiro.id) : '';
  });
  const [motoristaId, setMotoristaId] = useState<string>(() => {
    const primeiro = motoristasDoTipo('ADMINISTRATIVA')[0];
    return primeiro ? String(primeiro.id) : '';
  });
  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  const [ocupacoes, setOcupacoes] = useState<OcupacaoVeiculoSvo[]>([]);
  const [erroOcupacao, setErroOcupacao] = useState<string | null>(null);
  const [carregandoOcupacao, setCarregandoOcupacao] = useState(false);

  const veiculosFiltrados = veiculosDoTipo(tipoOperacao);
  const motoristasFiltrados = motoristasDoTipo(tipoOperacao);
  const isSvo = tipoOperacao === 'SVO';
  const ocupacaoDoVeiculo = ocupacoes.find((o) => String(o.id) === veiculoId);
  const ocupacaoPorId = (id: number) => ocupacoes.find((o) => o.id === id);
  const bloqueioSvo = isSvo && ocupacaoDoVeiculo ? motivoBloqueioSvo(ocupacaoDoVeiculo) : null;
  const podeSalvar = !isSvo && Boolean(solicitacaoId && veiculoId && motoristaId);

  const avisoSolicitacao = isSvo
    ? 'O agendamento SVO ainda não está integrado à listagem de solicitações nesta tela.'
    : erroSolicitacoes
      ? `Não foi possível carregar as solicitações: ${erroSolicitacoes}`
      : solicitacoesAprovadas.length === 0
        ? 'Não há solicitações aprovadas aguardando agendamento.'
        : null;

  // Ocupação atual dos veículos SVO (BL30): carregada ao escolher a operação SVO
  useEffect(() => {
    if (!isSvo) return;
    let ativo = true;
    setCarregandoOcupacao(true);
    setErroOcupacao(null);
    setOcupacoes([]);
    veiculosApi
      .listarOcupacaoSvo()
      .then((dados) => {
        if (!ativo) return;
        setOcupacoes(dados);
      })
      .catch((error) => {
        if (!ativo) return;
        setOcupacoes([]);
        setErroOcupacao(mensagemDeErro(error));
      })
      .finally(() => {
        if (ativo) setCarregandoOcupacao(false);
      });
    return () => {
      ativo = false;
    };
  }, [isSvo]);

  const handleMudarTipo = (novoTipo: TipoOperacaoViagem) => {
    setTipoOperacao(novoTipo);
    const veiculo = veiculosDoTipo(novoTipo)[0];
    const motorista = motoristasDoTipo(novoTipo)[0];
    setVeiculoId(veiculo ? String(veiculo.id) : '');
    setMotoristaId(motorista ? String(motorista.id) : '');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    if (bloqueioSvo) {
      setErro(bloqueioSvo);
      return;
    }

    if (!podeSalvar) {
      setErro('Selecione a solicitação, o veículo e o motorista.');
      return;
    }

    setSalvando(true);
    try {
      await onSalvar({
        tipo_operacao: tipoOperacao,
        solicitacao_id: Number(solicitacaoId),
        veiculo_id: Number(veiculoId),
        motorista_id: Number(motoristaId),
      });
      onClose();
    } catch (error) {
      setErro(mensagemDeErro(error));
      setSalvando(false);
    }
  };

  return (
    <Modal title="Agendar Viagem" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        {/* Tipo de Operação (Frota Adm vs SVO) */}
        <div className="mb-3.5">
          <Select
            label="Tipo de Operação *"
            value={tipoOperacao}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              handleMudarTipo(e.target.value as TipoOperacaoViagem)
            }
          >
            <option value="ADMINISTRATIVA">Frota Administrativa (Institucional)</option>
            <option value="SVO">Serviço de Verificação de Óbito (SVO)</option>
          </Select>
        </div>

        {/* Solicitação de Origem */}
        {avisoSolicitacao ? (
          <Alert tone="warning" className="mb-3.5">
            {avisoSolicitacao}
          </Alert>
        ) : (
          <div className="mb-3.5">
            <Select
              label="Solicitação Vinculada *"
              value={solicitacaoId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSolicitacaoId(e.target.value)}
            >
              {solicitacoesAprovadas.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} — {s.solicitante_nome} ({s.origem} → {s.destino})
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Veículo e Motorista */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Veículo Designado *"
            value={veiculoId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoId(e.target.value)}
            required
          >
            {veiculosFiltrados.length === 0 && <option value="">Nenhum veículo disponível</option>}
            {veiculosFiltrados.map((v) => {
              const ocupacao = isSvo ? ocupacaoPorId(v.id) : undefined;
              return (
                <option key={v.id} value={v.id}>
                  {v.modelo} ({v.placa}){sufixoStatus(v.status)}
                  {ocupacao ? ` — ${rotuloOcupacao(ocupacao)}` : ''}
                </option>
              );
            })}
          </Select>

          <Select
            label="Motorista Responsável *"
            value={motoristaId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setMotoristaId(e.target.value)}
            required
          >
            {motoristasFiltrados.length === 0 && (
              <option value="">Nenhum motorista disponível</option>
            )}
            {motoristasFiltrados.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} (CNH {m.categoria_cnh}){sufixoStatus(m.status)}
              </option>
            ))}
          </Select>
        </div>

        {isSvo && !carregandoOcupacao && erroOcupacao && (
          <Alert tone="warning" className="mt-3.5">
            Não foi possível carregar a ocupação dos veículos: {erroOcupacao}
          </Alert>
        )}
        {isSvo && carregandoOcupacao && (
          <div className="mt-3.5 flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            Carregando ocupação dos veículos SVO...
          </div>
        )}
        {isSvo && !carregandoOcupacao && !erroOcupacao && ocupacaoDoVeiculo && (
          <OcupacaoVeiculoSvoPainel veiculo={ocupacaoDoVeiculo} />
        )}

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!podeSalvar || salvando || Boolean(bloqueioSvo)}>
            {salvando ? 'Agendando...' : 'Agendar Viagem'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
