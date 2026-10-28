import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Input, Modal, Select } from '../../components/ui';
import { storageService } from '../../services/storageService';
import { LABELS_STATUS_MULTA, STATUS_MULTA } from '../../types/multa';
import type { Multa, NovaMultaInput, StatusPagamentoMulta } from '../../types/multa';

interface ModalMultaProps {
  /** Quando informado, o modal edita a multa (ex.: para vincular o motorista depois). */
  multa?: Multa;
  onClose: () => void;
  onSalvar: (multa: NovaMultaInput) => void;
}

/** Data/hora local no formato do input datetime-local (AAAA-MM-DDTHH:mm). */
function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ModalMulta({ multa, onClose, onSalvar }: ModalMultaProps) {
  const veiculos = useMemo(() => storageService.getVeiculos(), []);
  const motoristas = useMemo(() => storageService.getMotoristas(), []);
  const agora = useMemo(agoraLocal, []);

  const [veiculoId, setVeiculoId] = useState(multa ? String(multa.veiculo_id) : '');
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

  const handleSubmit = (e?: FormEvent) => {
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
    onSalvar({
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
          <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>
            {erro}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Select
            label="Veículo *"
            value={veiculoId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoId(e.target.value)}
          >
            <option value="">Selecione o veículo</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa} — {v.modelo}
              </option>
            ))}
          </Select>

          <Select
            label="Motorista responsável (quando aplicável)"
            value={motoristaId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setMotoristaId(e.target.value)}
          >
            <option value="">Sem motorista vinculado</option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Data e hora da infração *"
            type="datetime-local"
            max={agora}
            value={dataInfracao}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDataInfracao(e.target.value)}
          />
          <Input
            label="Vencimento"
            type="date"
            value={dataVencimento}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDataVencimento(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Código da infração (Detran)"
            placeholder="Ex: A123456789"
            maxLength={255}
            value={idInfracao}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setIdInfracao(e.target.value)}
          />
          <Input
            label="Órgão autuador"
            placeholder="Ex: PRF, SMTT, Detran"
            maxLength={255}
            value={orgao}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgao(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <Input
            label="Valor (R$) *"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Ex: 130.16"
            value={valor}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setValor(e.target.value)}
          />
          <Input
            label="Pontos na CNH *"
            type="number"
            step="1"
            min="0"
            value={pontos}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPontos(e.target.value)}
          />
          <Select
            label="Status do pagamento *"
            value={status}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as StatusPagamentoMulta)}
          >
            {STATUS_MULTA.map((s) => (
              <option key={s} value={s}>
                {LABELS_STATUS_MULTA[s]}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label="Descrição"
          placeholder="Ex: Excesso de velocidade"
          value={descricao}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDescricao(e.target.value)}
        />
      </form>
    </Modal>
  );
}
