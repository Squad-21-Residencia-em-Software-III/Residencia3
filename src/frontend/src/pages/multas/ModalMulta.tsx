import { useMemo, useState, useEffect } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Input, Modal, Select } from '../../components/ui';
import { LABELS_STATUS_MULTA, STATUS_MULTA } from '../../types/multa';
import type { Multa, NovaMultaInput, StatusPagamentoMulta } from '../../types/multa';
import type { Veiculo } from '../../types/veiculo';
import type { Motorista } from '../../types/motorista';
import { veiculosApi } from '../../services/api/veiculosApi';
import { motoristasApi } from '../../services/api/motoristasApi';

interface ModalMultaProps {
  /** Quando informado, o modal edita a multa (ex.: para vincular o motorista depois). */
  multa?: Multa;
  onClose: () => void;
  onSalvar: (multa: NovaMultaInput) => Promise<void> | void;
  veiculoIdInicial?: string;
  /** Restringe os veículos selecionáveis (ex.: Gestor SVO só registra multa de veículo SVO). */
  filtrarVeiculo?: (veiculo: Veiculo) => boolean;
}

/** Data/hora local no formato do input datetime-local (AAAA-MM-DDTHH:mm). */
function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ModalMulta({
  multa,
  onClose,
  onSalvar,
  veiculoIdInicial,
  filtrarVeiculo,
}: ModalMultaProps) {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const agora = useMemo(agoraLocal, []);

  const [veiculoId, setVeiculoId] = useState(
    multa ? String(multa.veiculo_id) : veiculoIdInicial ?? '',
  );
  const [motoristaId, setMotoristaId] = useState(multa?.motorista_id ? String(multa.motorista_id) : '');
  const [dataInfracao, setDataInfracao] = useState(multa?.data_infracao?.slice(0, 16) ?? agora);
  const [dataVencimento, setDataVencimento] = useState(multa?.data_vencimento ?? '');
  const [idInfracao, setIdInfracao] = useState(multa?.id_infracao ?? '');
  const [orgao, setOrgao] = useState(multa?.orgao_autuador ?? '');
  const [valor, setValor] = useState(multa ? String(multa.valor) : '');
  const [pontos, setPontos] = useState(multa ? String(multa.pontos) : '0');
  const [status, setStatus] = useState<StatusPagamentoMulta>(multa?.status_pagamento ?? 'PENDENTE');
  const [descricao, setDescricao] = useState(multa?.descricao ?? '');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    Promise.allSettled([veiculosApi.listar(), motoristasApi.listar()]).then(
      ([vRes, mRes]) => {
        if (!ativo) return;

        if (vRes.status === 'fulfilled') {
          setVeiculos(vRes.value);
          if (!veiculoId && vRes.value.length > 0) {
            setVeiculoId(String(vRes.value[0].id));
          }
        } else {
          setErro('Falha ao carregar veículos.');
        }

        if (mRes.status === 'fulfilled') {
          setMotoristas(mRes.value);
        } else {
          setErro((prev) =>
            prev
              ? `${prev} | Falha ao carregar motoristas para vinculação.`
              : 'Falha ao carregar lista de motoristas para vinculação.'
          );
        }
      }
    );
    return () => {
      ativo = false;
    };
  }, [veiculoId]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (enviando) return;

    const vId = Number(veiculoId);
    const v = parseFloat(valor.replace(',', '.'));
    const p = Number(pontos);

    if (!vId) return setErro('Selecione o veículo.');
    if (!dataInfracao) return setErro('Informe a data e hora da infração.');
    if (dataInfracao > agoraLocal()) return setErro('A data da infração não pode ser futura.');
    if (!v || v <= 0) return setErro('Informe um valor maior que zero.');
    if (!Number.isInteger(p) || p < 0) return setErro('Informe os pontos (número inteiro, 0 ou mais).');
    if (dataVencimento && dataVencimento < dataInfracao.slice(0, 10)) {
      return setErro('O vencimento não pode ser anterior à data da infração.');
    }

    setErro('');
    setEnviando(true);
    try {
      await onSalvar({
        veiculo_id: vId,
        motorista_id: motoristaId ? Number(motoristaId) : null,
        id_infracao: idInfracao.trim() || undefined,
        orgao_autuador: orgao.trim() || undefined,
        data_infracao: dataInfracao,
        data_vencimento: dataVencimento || null,
        status_pagamento: status,
        valor: Number(v.toFixed(2)),
        descricao: descricao.trim() || undefined,
        pontos: p,
      });
      onClose();
    } catch (err: any) {
      setErro(err.message || 'Erro ao salvar multa.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      title={multa ? 'Editar multa/infração' : 'Registrar multa/infração'}
      onClose={onClose}
      onConfirm={() => handleSubmit()}
      confirmLabel={multa ? 'Salvar alterações' : 'Registrar multa'}
    >
      <form onSubmit={handleSubmit} noValidate>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Veículo *"
            value={veiculoId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoId(e.target.value)}
          >
            <option value="">Selecione o veículo</option>
            {(filtrarVeiculo ? veiculos.filter(filtrarVeiculo) : veiculos).map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa} — {v.modelo}
              </option>
            ))}
          </Select>

          <Select
            label="Motorista responsável"
            value={motoristaId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setMotoristaId(e.target.value)}
          >
            <option value="">Sem condutor identificado (ainda)</option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Data e hora da infração *"
            type="datetime-local"
            value={dataInfracao}
            max={agora}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDataInfracao(e.target.value)}
          />

          <Input
            label="Data de vencimento"
            type="date"
            value={dataVencimento}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDataVencimento(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Código da infração"
            placeholder="Ex.: 7455-0 (Detran)"
            value={idInfracao}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setIdInfracao(e.target.value)}
          />

          <Input
            label="Órgão autuador"
            placeholder="Ex.: PRF, SMTT"
            value={orgao}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgao(e.target.value)}
          />

          <Select
            label="Status de pagamento *"
            value={status}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setStatus(e.target.value as StatusPagamentoMulta)
            }
          >
            {STATUS_MULTA.map((s) => (
              <option key={s} value={s}>
                {LABELS_STATUS_MULTA[s]}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Valor (R$) *"
            placeholder="Ex.: 195,23"
            value={valor}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setValor(e.target.value)}
          />

          <Input
            label="Pontos na CNH *"
            type="number"
            min="0"
            max="20"
            value={pontos}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPontos(e.target.value)}
          />
        </div>

        <Input
          label="Descrição do fato"
          placeholder="Ex.: Excesso de velocidade em até 20% na BR-101 km 92."
          value={descricao}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDescricao(e.target.value)}
        />
      </form>
    </Modal>
  );
}
