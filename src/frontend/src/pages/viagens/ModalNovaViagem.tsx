import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal, Select } from '../../components/ui';
import type { Motorista } from '../../types/motorista';
import type { Veiculo } from '../../types/veiculo';
import type { SolicitacaoViagem } from '../../types/solicitacao';
import type { TipoOperacaoViagem, Viagem } from '../../types/viagem';

interface ModalNovaViagemProps {
  solicitacoesAprovadas: SolicitacaoViagem[];
  veiculos: Veiculo[];
  motoristas: Motorista[];
  onClose: () => void;
  onSalvar: (novaViagem: Omit<Viagem, 'id'>) => void;
}

export function ModalNovaViagem({
  solicitacoesAprovadas,
  veiculos,
  motoristas,
  onClose,
  onSalvar,
}: ModalNovaViagemProps) {
  const agoraIso = new Date().toISOString().slice(0, 16);

  const [solicitacaoId, setSolicitacaoId] = useState<string>(
    solicitacoesAprovadas[0] ? String(solicitacoesAprovadas[0].id) : '',
  );
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacaoViagem>('ADMINISTRATIVA');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [solicitanteNome, setSolicitanteNome] = useState('');

  const [veiculoId, setVeiculoId] = useState<string>(
    veiculos[0] ? String(veiculos[0].id) : '',
  );
  const [motoristaId, setMotoristaId] = useState<string>(
    motoristas[0] ? String(motoristas[0].id) : '',
  );
  const [kmInicial, setKmInicial] = useState<string>('35000');
  const [dataHoraSaida, setDataHoraSaida] = useState<string>(agoraIso);
  const [erro, setErro] = useState<string>('');

  // Sincroniza dados da solicitação selecionada
  const solicitacaoSelecionada = solicitacoesAprovadas.find(
    (s) => String(s.id) === solicitacaoId,
  );

  const handleMudarSolicitacao = (idStr: string) => {
    setSolicitacaoId(idStr);
    const sel = solicitacoesAprovadas.find((s) => String(s.id) === idStr);
    if (sel) {
      setOrigem(sel.origem);
      setDestino(sel.destino);
      setFinalidade(sel.finalidade);
      setSolicitanteNome(sel.solicitante_nome);
    }
  };

  const veiculosFiltrados = veiculos.filter(
    (v) => (tipoOperacao === 'ADMINISTRATIVA' ? v.tipo_frota === 'ADMINISTRATIVA' : v.tipo_frota === 'SVO'),
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const orig = solicitacaoSelecionada ? solicitacaoSelecionada.origem : origem.trim();
    const dest = solicitacaoSelecionada ? solicitacaoSelecionada.destino : destino.trim();
    const fin = solicitacaoSelecionada ? solicitacaoSelecionada.finalidade : finalidade.trim();
    const solNome = solicitacaoSelecionada ? solicitacaoSelecionada.solicitante_nome : solicitanteNome.trim();

    if (!orig || !dest) {
      setErro('Informe origem e destino da viagem.');
      return;
    }

    const veic = veiculos.find((v) => String(v.id) === veiculoId);
    if (!veic) {
      setErro('Selecione um veículo.');
      return;
    }

    const mot = motoristas.find((m) => String(m.id) === motoristaId);
    if (!mot) {
      setErro('Selecione um motorista.');
      return;
    }

    const kmIniNum = Number(kmInicial);
    if (isNaN(kmIniNum) || kmIniNum < 0) {
      setErro('Informe um odômetro inicial válido.');
      return;
    }

    onSalvar({
      solicitacao_id: solicitacaoSelecionada ? solicitacaoSelecionada.id : Math.floor(1000 + Math.random() * 9000),
      tipo_operacao: tipoOperacao,
      origem: orig,
      destino: dest,
      finalidade: fin || 'Transporte institucional regular',
      solicitante_nome: solNome || 'Coordenação de Transportes',
      veiculo_id: veic.id,
      veiculo_modelo: veic.modelo,
      veiculo_placa: veic.placa,
      motorista_id: mot.id,
      motorista_nome: mot.nome,
      km_inicial: kmIniNum,
      km_final: null,
      data_hora_efetiva_saida: `${dataHoraSaida}:00`,
      data_hora_efetiva_chegada: null,
      status: 'AGENDADA',
    });

    onClose();
  };

  return (
    <Modal title="Agendar / Despachar Viagem" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>{erro}</p>
        )}

        {/* Tipo de Operação (Frota Adm vs SVO) */}
        <div style={{ marginBottom: '14px' }}>
          <Select
            label="Tipo de Operação *"
            value={tipoOperacao}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const novoTipo = e.target.value as TipoOperacaoViagem;
              setTipoOperacao(novoTipo);
              const primeiroCompativel = veiculos.find((v) =>
                novoTipo === 'ADMINISTRATIVA' ? v.tipo_frota === 'ADMINISTRATIVA' : v.tipo_frota === 'SVO',
              );
              if (primeiroCompativel) setVeiculoId(String(primeiroCompativel.id));
            }}
          >
            <option value="ADMINISTRATIVA">Frota Administrativa (Institucional)</option>
            <option value="SVO">Serviço de Verificação de Óbito (SVO)</option>
          </Select>
        </div>

        {/* Solicitação de Origem */}
        {solicitacoesAprovadas.length > 0 ? (
          <div style={{ marginBottom: '14px' }}>
            <Select
              label="Solicitação Vinculada *"
              value={solicitacaoId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => handleMudarSolicitacao(e.target.value)}
            >
              {solicitacoesAprovadas.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} — {s.solicitante_nome} ({s.origem} → {s.destino})
                </option>
              ))}
              <option value="">+ Outra viagem / Demanda direta</option>
            </Select>
          </div>
        ) : null}

        {(!solicitacaoId || solicitacoesAprovadas.length === 0) && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input
                label="Origem *"
                placeholder="Ex: Sede FSPH"
                value={origem}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOrigem(e.target.value)}
                required
              />
              <Input
                label="Destino *"
                placeholder="Ex: HUSE - Aracaju"
                value={destino}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDestino(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input
                label="Solicitante *"
                placeholder="Ex: Mariana Souza"
                value={solicitanteNome}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSolicitanteNome(e.target.value)}
                required
              />
              <Input
                label="Finalidade da Viagem"
                placeholder="Ex: Entrega de documentos"
                value={finalidade}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFinalidade(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Veículo e Motorista */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Select
            label="Veículo Designado *"
            value={veiculoId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoId(e.target.value)}
            required
          >
            {veiculosFiltrados.map((v) => (
              <option key={v.id} value={v.id}>
                {v.modelo} ({v.placa})
              </option>
            ))}
          </Select>

          <Select
            label="Motorista Responsável *"
            value={motoristaId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setMotoristaId(e.target.value)}
            required
          >
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} (CNH {m.categoria_cnh})
              </option>
            ))}
          </Select>
        </div>

        {/* Odômetro e Saída */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Odômetro de Saída (Km Inicial) *"
            type="number"
            placeholder="Ex: 35000"
            value={kmInicial}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setKmInicial(e.target.value)}
            required
          />

          <Input
            label="Data/Hora Prevista de Saída *"
            type="datetime-local"
            value={dataHoraSaida}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDataHoraSaida(e.target.value)}
            required
          />
        </div>

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Agendar Viagem</Button>
        </div>
      </form>
    </Modal>
  );
}
