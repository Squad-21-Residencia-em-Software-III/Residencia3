import { useState, useMemo } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Badge, Button, Card, IdBadge, Input, Modal, Select, Table } from '../../components/ui';
import type { BadgeTone } from '../../components/ui';
import type { Veiculo } from '../../types/veiculo';
import type { Manutencao, NovaManutencaoInput, StatusManutencao, TipoManutencao } from '../../types/manutencao';
import { storageService } from '../../services/storageService';

interface ModalManutencoesVeiculoProps {
  veiculo: Veiculo;
  onClose: () => void;
  onManutencaoSalva: (mensagem: string) => void;
}

const STATUS_MAP: Record<StatusManutencao, { label: string; tone: BadgeTone }> = {
  AGENDADA: { label: 'Agendada', tone: 'neutral' },
  EM_ANDAMENTO: { label: 'Em Andamento', tone: 'info' },
  CONCLUIDA: { label: 'Concluída', tone: 'success' },
};

const TIPO_MAP: Record<TipoManutencao, { label: string; tone: BadgeTone }> = {
  PREVENTIVA: { label: 'Preventiva', tone: 'info' },
  CORRETIVA: { label: 'Corretiva', tone: 'danger' },
};

export function ModalManutencoesVeiculo({
  veiculo,
  onClose,
  onManutencaoSalva,
}: ModalManutencoesVeiculoProps) {
  const [veiculoAtual, setVeiculoAtual] = useState<Veiculo>(veiculo);
  const [manutencoes, setManutencoes] = useState<Manutencao[]>(() =>
    storageService.getManutencoesPorVeiculo(veiculo.id)
  );

  const [abaAtiva, setAbaAtiva] = useState<'HISTORICO' | 'NOVA'>('HISTORICO');

  // Formulário de Nova Manutenção
  const [tipo, setTipo] = useState<TipoManutencao>('PREVENTIVA');
  const [dataManutencao, setDataManutencao] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [custo, setCusto] = useState<string>('');
  const [status, setStatus] = useState<StatusManutencao>('CONCLUIDA');
  const [descricao, setDescricao] = useState<string>('');
  const [atualizarStatusVeiculo, setAtualizarStatusVeiculo] = useState<boolean>(false);
  const [erro, setErro] = useState<string>('');

  // Totalizadores do veículo
  const totais = useMemo(() => {
    const totalGasto = manutencoes.reduce((acc, m) => acc + Number(m.custo), 0);
    const preventivas = manutencoes.filter((m) => m.tipo_manutencao === 'PREVENTIVA').length;
    const corretivas = manutencoes.filter((m) => m.tipo_manutencao === 'CORRETIVA').length;
    const emAndamento = manutencoes.filter((m) => m.status === 'EM_ANDAMENTO').length;

    return {
      totalGasto: totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      totalQtd: manutencoes.length,
      preventivas,
      corretivas,
      emAndamento,
    };
  }, [manutencoes]);

  const handleStatusChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const novoStatus = e.target.value as StatusManutencao;
    setStatus(novoStatus);
    if (novoStatus === 'EM_ANDAMENTO') {
      setAtualizarStatusVeiculo(true);
    }
  };

  const handleConcluirManutencao = (id: number) => {
    try {
      const res = storageService.atualizarStatusManutencao(id, 'CONCLUIDA');
      const listaAtualizada = storageService.getManutencoesPorVeiculo(veiculoAtual.id);
      setManutencoes(listaAtualizada);

      // Sincroniza estado do veículo local
      const veiculos = storageService.getVeiculos();
      const vAtual = veiculos.find((v) => v.id === veiculoAtual.id);
      if (vAtual) setVeiculoAtual(vAtual);

      const msg = res.veiculoLiberado
        ? `Manutenção concluída! Veículo ${veiculoAtual.placa} liberado para DISPONÍVEL.`
        : `Manutenção concluída com sucesso!`;

      onManutencaoSalva(msg);
    } catch (err: any) {
      setErro(err.message || 'Erro ao concluir manutenção.');
    }
  };

  const handleIniciarManutencao = (id: number) => {
    try {
      storageService.atualizarStatusManutencao(id, 'EM_ANDAMENTO');
      const listaAtualizada = storageService.getManutencoesPorVeiculo(veiculoAtual.id);
      setManutencoes(listaAtualizada);

      // Sincroniza estado do veículo local
      const veiculos = storageService.getVeiculos();
      const vAtual = veiculos.find((v) => v.id === veiculoAtual.id);
      if (vAtual) setVeiculoAtual(vAtual);

      onManutencaoSalva(
        `Manutenção iniciada! Veículo ${veiculoAtual.placa} colocado em MANUTENÇÃO.`
      );
    } catch (err: any) {
      setErro(err.message || 'Erro ao iniciar manutenção.');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const custoNum = parseFloat(custo.replace(',', '.'));

    if (isNaN(custoNum) || custoNum < 0) {
      setErro('Informe um custo numérico válido e maior ou igual a zero.');
      return;
    }

    if (!dataManutencao) {
      setErro('Informe a data da manutenção.');
      return;
    }

    if (!descricao.trim()) {
      setErro('A descrição da manutenção é obrigatória.');
      return;
    }

    try {
      const payload: NovaManutencaoInput = {
        veiculo_id: veiculoAtual.id,
        tipo_manutencao: tipo,
        data_manutencao: dataManutencao,
        descricao: descricao.trim(),
        custo: custoNum,
        status,
        atualizar_status_veiculo: atualizarStatusVeiculo || status === 'EM_ANDAMENTO',
      };

      storageService.createManutencao(payload);
      const listaAtualizada = storageService.getManutencoesPorVeiculo(veiculoAtual.id);
      setManutencoes(listaAtualizada);

      // Sincroniza estado do veículo local
      const veiculos = storageService.getVeiculos();
      const vAtual = veiculos.find((v) => v.id === veiculoAtual.id);
      if (vAtual) setVeiculoAtual(vAtual);

      // Limpar formulário
      setDescricao('');
      setCusto('');
      setAbaAtiva('HISTORICO');

      const msgVeiculo =
        status === 'EM_ANDAMENTO'
          ? ` (Veículo colocado em MANUTENÇÃO)`
          : vAtual?.status === 'DISPONIVEL' && veiculoAtual.status === 'MANUTENCAO'
          ? ` (Veículo liberado para DISPONÍVEL)`
          : '';

      onManutencaoSalva(
        `Manutenção ${tipo.toLowerCase()} registrada com sucesso!${msgVeiculo}`
      );
    } catch (err: any) {
      setErro(err.message || 'Erro ao salvar manutenção.');
    }
  };

  return (
    <Modal
      title={`Manutenções — ${veiculoAtual.modelo}`}
      onClose={onClose}
      maxWidth="800px"
    >
      <div style={{ display: 'grid', gap: '20px' }}>
        {/* Cabeçalho do Veículo Selecionado */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--color-surface-alt)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <IdBadge id={veiculoAtual.placa} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
              {veiculoAtual.modelo}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                background:
                  veiculoAtual.tipo_frota === 'SVO' ? 'var(--color-purple-bg)' : 'var(--color-neutral-bg)',
                color:
                  veiculoAtual.tipo_frota === 'SVO' ? 'var(--color-purple)' : 'var(--color-text-strong)',
              }}
            >
              Frota {veiculoAtual.tipo_frota}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Status Veículo:</span>
            <Badge
              tone={
                veiculoAtual.status === 'DISPONIVEL'
                  ? 'success'
                  : veiculoAtual.status === 'MANUTENCAO'
                  ? 'danger'
                  : 'info'
              }
            >
              {veiculoAtual.status}
            </Badge>
          </div>
        </div>

        {/* Resumo de Custos e Totais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Card style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-primary)' }}>
              {totais.totalGasto}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Total Investido
            </div>
          </Card>

          <Card style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text)' }}>
              {totais.totalQtd}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Intervenções ({totais.preventivas} prev / {totais.corretivas} corr)
            </div>
          </Card>

          <Card style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color:
                  totais.emAndamento > 0
                    ? 'var(--color-danger)'
                    : 'var(--color-success)',
              }}
            >
              {totais.emAndamento > 0
                ? `${totais.emAndamento} Em Andamento`
                : 'Frota Liberada'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Condição Operacional
            </div>
          </Card>
        </div>

        {/* Barra de Abas Internas: Histórico vs Registrar */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--color-divider)',
            paddingBottom: '8px',
          }}
        >
          <button
            type="button"
            onClick={() => setAbaAtiva('HISTORICO')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              background: abaAtiva === 'HISTORICO' ? 'var(--color-primary)' : 'transparent',
              color: abaAtiva === 'HISTORICO' ? '#fff' : 'var(--color-text-secondary)',
              border: '1px solid',
              borderColor: abaAtiva === 'HISTORICO' ? 'var(--color-primary)' : 'var(--color-border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            📋 Histórico de Manutenções ({manutencoes.length})
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('NOVA')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              background: abaAtiva === 'NOVA' ? 'var(--color-primary)' : 'transparent',
              color: abaAtiva === 'NOVA' ? '#fff' : 'var(--color-text-secondary)',
              border: '1px solid',
              borderColor: abaAtiva === 'NOVA' ? 'var(--color-primary)' : 'var(--color-border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            ➕ Registrar Nova Manutenção
          </button>
        </div>

        {/* Conteúdo da Aba Ativa */}
        {abaAtiva === 'HISTORICO' ? (
          <div>
            {manutencoes.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: 'var(--color-surface-alt)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--color-border)',
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔧</div>
                <div style={{ fontWeight: 600, color: 'var(--color-text-strong)', fontSize: '15px' }}>
                  Nenhuma manutenção registrada para este veículo.
                </div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '6px 0 16px' }}>
                  Todas as manutenções preventivas e corretivas cadastradas aparecerão aqui.
                </p>
                <Button onClick={() => setAbaAtiva('NOVA')}>Registrar Primeira Manutenção</Button>
              </div>
            ) : (
              <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Descrição</th>
                      <th>Custo</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Ação Rápida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manutencoes.map((m) => {
                      const tipoInfo = TIPO_MAP[m.tipo_manutencao] || {
                        label: m.tipo_manutencao,
                        tone: 'neutral',
                      };
                      const statusInfo = STATUS_MAP[m.status] || {
                        label: m.status,
                        tone: 'neutral',
                      };

                      return (
                        <tr key={m.id}>
                          <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {new Date(m.data_manutencao).toLocaleDateString('pt-BR', {
                              timeZone: 'UTC',
                            })}
                          </td>
                          <td>
                            <Badge tone={tipoInfo.tone}>{tipoInfo.label}</Badge>
                          </td>
                          <td style={{ maxWidth: '200px' }} title={m.descricao}>
                            <div
                              style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontSize: '13px',
                              }}
                            >
                              {m.descricao}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {Number(m.custo).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                          <td>
                            <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {m.status === 'EM_ANDAMENTO' ? (
                              <button
                                type="button"
                                onClick={() => handleConcluirManutencao(m.id)}
                                title="Finalizar serviço e liberar o veículo"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--color-surface)',
                                  border: '1px solid var(--color-success)',
                                  color: 'var(--color-success)',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--color-success)';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'var(--color-surface)';
                                  e.currentTarget.style.color = 'var(--color-success)';
                                }}
                              >
                                ✅ Concluir
                              </button>
                            ) : m.status === 'AGENDADA' ? (
                              <button
                                type="button"
                                onClick={() => handleIniciarManutencao(m.id)}
                                title="Iniciar serviço e colocar veículo em manutenção"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--color-surface)',
                                  border: '1px solid var(--color-primary)',
                                  color: 'var(--color-primary)',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--color-primary)';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'var(--color-surface)';
                                  e.currentTarget.style.color = 'var(--color-primary)';
                                }}
                              >
                                ▶️ Iniciar
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                Concluída
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {erro && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-danger)',
                  color: 'var(--color-danger)',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '16px',
                }}
              >
                ⚠️ {erro}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Select
                label="Tipo de Manutenção *"
                value={tipo}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setTipo(e.target.value as TipoManutencao)
                }
              >
                <option value="PREVENTIVA">Preventiva (Revisão periódica, troca de óleo)</option>
                <option value="CORRETIVA">Corretiva (Conserto de avarias, falhas)</option>
              </Select>

              <Input
                label="Data da Manutenção *"
                type="date"
                value={dataManutencao}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDataManutencao(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input
                label="Custo Total (R$) *"
                placeholder="Ex: 450,00"
                type="number"
                min="0"
                step="0.01"
                value={custo}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCusto(e.target.value)}
                required
              />

              <Select
                label="Status da Manutenção *"
                value={status}
                onChange={handleStatusChange}
              >
                <option value="CONCLUIDA">Concluída (Finalizada)</option>
                <option value="EM_ANDAMENTO">Em Andamento (Oficina / Parado)</option>
                <option value="AGENDADA">Agendada (Planejada)</option>
              </Select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Descrição Detalhada do Serviço *
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Troca de pastilhas de freio dianteiras, substituição de filtros e fluido de freio..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
                required
              />
            </div>

            {/* Aviso inteligente de liberação do veículo ou colocação em manutenção */}
            {status === 'EM_ANDAMENTO' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'var(--color-surface-alt)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-primary)',
                  color: 'var(--color-primary)',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: '16px',
                }}
              >
                ℹ️ Como o status é <strong>Em Andamento</strong>, o veículo será colocado automaticamente em <strong>MANUTENÇÃO</strong>.
              </div>
            ) : status === 'CONCLUIDA' && veiculoAtual.status === 'MANUTENCAO' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'var(--color-surface-alt)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-success)',
                  color: 'var(--color-success)',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: '16px',
                }}
              >
                ✅ Como o status é <strong>Concluída</strong>, o veículo será liberado para <strong>DISPONÍVEL</strong> automaticamente se não houver outras manutenções em andamento.
              </div>
            ) : null}

            <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
              <Button variant="ghost" type="button" onClick={() => setAbaAtiva('HISTORICO')}>
                Voltar ao Histórico
              </Button>
              <Button type="submit">Salvar Registro de Manutenção</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
