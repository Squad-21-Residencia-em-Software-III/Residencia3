import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Modal, Select } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import type { Motorista, StatusMotorista } from '../../types/motorista';
import type { StatusVeiculo, Veiculo } from '../../types/veiculo';
import type { SolicitacaoViagem } from '../../types/solicitacao';
import type { NovaViagemInput, TipoOperacaoViagem } from '../../types/viagem';

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
    veiculos.filter((v) => v.tipo_frota === tipo && !VEICULO_BLOQUEADO.includes(v.status));
  const motoristasDoTipo = (tipo: TipoOperacaoViagem) =>
    motoristas.filter(
      (m) =>
        m.tipo_motorista === (tipo === 'SVO' ? 'SVO' : 'FROTA') && !MOTORISTA_BLOQUEADO.includes(m.status),
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

  const veiculosFiltrados = veiculosDoTipo(tipoOperacao);
  const motoristasFiltrados = motoristasDoTipo(tipoOperacao);
  const isSvo = tipoOperacao === 'SVO';
  const podeSalvar = !isSvo && Boolean(solicitacaoId && veiculoId && motoristaId);

  const avisoSolicitacao = isSvo
    ? 'A listagem de solicitações SVO ainda não está disponível na API.'
    : erroSolicitacoes
      ? `Não foi possível carregar as solicitações: ${erroSolicitacoes}`
      : solicitacoesAprovadas.length === 0
        ? 'Não há solicitações aprovadas aguardando agendamento.'
        : null;

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
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>{erro}</p>
        )}

        {/* Tipo de Operação (Frota Adm vs SVO) */}
        <div style={{ marginBottom: '14px' }}>
          <Select
            label="Tipo de Operação *"
            value={tipoOperacao}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleMudarTipo(e.target.value as TipoOperacaoViagem)}
          >
            <option value="ADMINISTRATIVA">Frota Administrativa (Institucional)</option>
            <option value="SVO">Serviço de Verificação de Óbito (SVO)</option>
          </Select>
        </div>

        {/* Solicitação de Origem */}
        {avisoSolicitacao ? (
          <p style={{ color: 'var(--color-warning)', fontSize: '13px', margin: '0 0 14px' }}>{avisoSolicitacao}</p>
        ) : (
          <div style={{ marginBottom: '14px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Select
            label="Veículo Designado *"
            value={veiculoId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoId(e.target.value)}
            required
          >
            {veiculosFiltrados.length === 0 && <option value="">Nenhum veículo disponível</option>}
            {veiculosFiltrados.map((v) => (
              <option key={v.id} value={v.id}>
                {v.modelo} ({v.placa}){sufixoStatus(v.status)}
              </option>
            ))}
          </Select>

          <Select
            label="Motorista Responsável *"
            value={motoristaId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setMotoristaId(e.target.value)}
            required
          >
            {motoristasFiltrados.length === 0 && <option value="">Nenhum motorista disponível</option>}
            {motoristasFiltrados.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} (CNH {m.categoria_cnh}){sufixoStatus(m.status)}
              </option>
            ))}
          </Select>
        </div>

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!podeSalvar || salvando}>
            {salvando ? 'Agendando...' : 'Agendar Viagem'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
