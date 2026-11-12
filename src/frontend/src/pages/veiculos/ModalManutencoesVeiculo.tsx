import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowLeft, ClipboardList, Plus, Wrench } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  ModalForm,
  PlacaMercosul,
  Select,
  Table,
  Textarea,
} from '../../components/ui';
import type { BadgeTone } from '../../components/ui';
import type { Veiculo } from '../../types/veiculo';
import type {
  Manutencao,
  StatusManutencao,
  TipoManutencao,
} from '../../types/manutencao';
import { manutencoesApi } from '../../services/api/manutencoesApi';
import { veiculosApi } from '../../services/api/veiculosApi';
import { mensagemDeErro } from '../../services/api/http';
import { cn } from '../../utils/cn';

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
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);

  const [modoCriacao, setModoCriacao] = useState<boolean>(false);

  // Formulário de Nova Manutenção
  const [tipo, setTipo] = useState<TipoManutencao>('PREVENTIVA');
  const [dataManutencao, setDataManutencao] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [custo, setCusto] = useState<string>('');
  const [status, setStatus] = useState<StatusManutencao>('CONCLUIDA');
  const [descricao, setDescricao] = useState<string>('');
  const [atualizarStatusVeiculo, setAtualizarStatusVeiculo] = useState<boolean>(false);
  const [erro, setErro] = useState<string>('');

  const carregarManutencoes = useCallback(async () => {
    try {
      const lista = await manutencoesApi.listarPorVeiculo(veiculo.id);
      setManutencoes(lista);
      const veiculos = await veiculosApi.listar();
      const vAtual = veiculos.find((v) => v.id === veiculo.id);
      if (vAtual) setVeiculoAtual(vAtual);
    } catch {
      // Ignora erro inicial
    }
  }, [veiculo.id]);

  useEffect(() => {
    carregarManutencoes();
  }, [carregarManutencoes]);

  // Totalizadores do veículo
  const totais = useMemo(() => {
    const totalGasto = manutencoes.reduce((acc, m) => acc + Number(m.custo), 0);
    const preventivas = manutencoes.filter((m) => m.tipo_manutencao === 'PREVENTIVA').length;
    const corretivas = manutencoes.filter((m) => m.tipo_manutencao === 'CORRETIVA').length;
    const emAndamento = manutencoes.filter((m) => m.status === 'EM_ANDAMENTO').length;

    return {
      totalGasto: totalGasto.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
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

  const handleConcluirManutencao = async (id: number) => {
    try {
      await manutencoesApi.atualizarStatus(id, 'CONCLUIDA');
      await carregarManutencoes();
      onManutencaoSalva(`Manutenção concluída! Veículo ${veiculoAtual.placa} atualizado.`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  };

  const handleIniciarManutencao = async (id: number) => {
    try {
      await manutencoesApi.atualizarStatus(id, 'EM_ANDAMENTO');
      await carregarManutencoes();
      onManutencaoSalva(`Manutenção iniciada! Veículo ${veiculoAtual.placa} colocado em MANUTENÇÃO.`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
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
      await manutencoesApi.criar({
        veiculo_id: veiculoAtual.id,
        tipo_manutencao: tipo,
        data_manutencao: dataManutencao,
        descricao: descricao.trim(),
        custo: custoNum,
        status,
        atualizar_status_veiculo: atualizarStatusVeiculo || status === 'EM_ANDAMENTO',
      });

      await carregarManutencoes();

      // Limpar formulário
      setDescricao('');
      setCusto('');
      setModoCriacao(false);

      onManutencaoSalva(`Manutenção ${tipo.toLowerCase()} registrada com sucesso!`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  };

  return (
    <Modal title={`Manutenções — ${veiculoAtual.modelo}`} onClose={onClose} maxWidth="800px">
      <div className="flex flex-col gap-5">
        {/* Cabeçalho do Veículo Selecionado */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-alt p-3.5">
          <div className="flex items-center gap-3">
            <PlacaMercosul placa={veiculoAtual.placa} size="sm" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold text-slate-900">
                  {veiculoAtual.modelo}
                </span>
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                    veiculoAtual.tipo_frota === 'SVO'
                      ? 'bg-purple-bg text-purple'
                      : 'bg-blue-50 text-blue-700',
                  )}
                >
                  Frota {veiculoAtual.tipo_frota}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-text-muted">
                Km atual:{' '}
                <strong className="font-semibold text-text">
                  {veiculoAtual.km_atual?.toLocaleString('pt-BR') ?? '—'} km
                </strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Status do Veículo:</span>
            <Badge
              tone={
                veiculoAtual.status === 'DISPONIVEL'
                  ? 'success'
                  : veiculoAtual.status === 'MANUTENCAO'
                    ? 'danger'
                    : 'info'
              }
            >
              {veiculoAtual.status === 'MANUTENCAO' ? 'Em Manutenção' : veiculoAtual.status}
            </Badge>
          </div>
        </div>

        {/* Resumo de Custos e Totais */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface p-3.5 text-center shadow-2xs">
            <div className="font-display text-lg font-bold tracking-tight text-primary">
              {totais.totalGasto}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">Total Investido</div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface p-3.5 text-center shadow-2xs">
            <div className="font-display text-lg font-bold tracking-tight text-slate-900">
              {totais.totalQtd}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              Intervenções ({totais.preventivas} prev / {totais.corretivas} corr)
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface p-3.5 text-center shadow-2xs">
            <div
              className={cn(
                'font-display text-lg font-bold tracking-tight',
                totais.emAndamento > 0 ? 'text-rose-600' : 'text-emerald-600',
              )}
            >
              {totais.emAndamento > 0 ? `${totais.emAndamento} Em Andamento` : 'Frota Liberada'}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">Condição Operacional</div>
          </div>
        </div>

        {/* Conteúdo Principal: Histórico vs Formulário de Cadastro */}
        {!modoCriacao ? (
          <div className="flex flex-col gap-3.5">
            {/* Barra de Ação do Histórico com Botão Primário em Destaque */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-primary" />
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Histórico de Manutenções
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {manutencoes.length}
                </span>
              </div>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setModoCriacao(true)}
              >
                <Plus size={14} className="mr-1" /> Registrar Nova Manutenção
              </Button>
            </div>

            {manutencoes.length === 0 ? (
              <EmptyState
                icon={<Wrench size={28} />}
                title="Nenhuma manutenção registrada para este veículo."
                description="Todas as manutenções preventivas e corretivas cadastradas aparecerão aqui."
                action={
                  <Button variant="primary" onClick={() => setModoCriacao(true)}>
                    <Plus size={14} className="mr-1" /> Registrar Primeira Manutenção
                  </Button>
                }
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="max-h-[340px] overflow-y-auto">
                  <Table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Descrição</th>
                        <th>Custo</th>
                        <th>Status</th>
                        <th className="text-right">Ações</th>
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
                            <td className="font-medium whitespace-nowrap">
                              {new Date(m.data_manutencao).toLocaleDateString('pt-BR', {
                                timeZone: 'UTC',
                              })}
                            </td>
                            <td>
                              <Badge tone={tipoInfo.tone}>{tipoInfo.label}</Badge>
                            </td>
                            <td className="max-w-[200px]" title={m.descricao}>
                              <div className="truncate text-[13px]">{m.descricao}</div>
                            </td>
                            <td className="font-semibold whitespace-nowrap">
                              {Number(m.custo).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                            <td>
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                            </td>
                            <td className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {m.status === 'EM_ANDAMENTO' ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleConcluirManutencao(m.id)}
                                    title="Finalizar serviço e liberar o veículo"
                                  >
                                    Concluir
                                  </Button>
                                ) : m.status === 'AGENDADA' ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleIniciarManutencao(m.id)}
                                    title="Iniciar serviço e colocar veículo em manutenção"
                                  >
                                    Iniciar
                                  </Button>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-400 select-none pr-2">
                                    —
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Cabeçalho do Formulário com Botão de Voltar */}
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setModoCriacao(false)}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-slate-600 transition-colors hover:bg-surface-hover hover:text-slate-900"
                  title="Voltar ao histórico"
                  aria-label="Voltar ao histórico"
                >
                  <ArrowLeft size={14} />
                </button>
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Registrar Nova Manutenção
                  </h3>
                  <p className="text-xs text-text-muted">
                    Preencha os dados do serviço executado no veículo.
                  </p>
                </div>
              </div>
            </div>

            <ModalForm onSubmit={handleSubmit}>
              {erro && <Alert tone="danger">{erro}</Alert>}

              <FormRow>
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
              </FormRow>

              <FormRow>
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

                <Select label="Status da Manutenção *" value={status} onChange={handleStatusChange}>
                  <option value="CONCLUIDA">Concluída (Finalizada)</option>
                  <option value="EM_ANDAMENTO">Em Andamento (Oficina / Parado)</option>
                  <option value="AGENDADA">Agendada (Planejada)</option>
                </Select>
              </FormRow>

              <Textarea
                label="Descrição Detalhada do Serviço *"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Troca de pastilhas de freio dianteiras, substituição de filtros e fluido de freio..."
                rows={3}
                required
              />

              {/* Aviso inteligente de liberação do veículo ou colocação em manutenção */}
              {status === 'EM_ANDAMENTO' ? (
                <Alert tone="info">
                  Como o status é <strong>Em Andamento</strong>, o veículo será colocado
                  automaticamente em <strong>MANUTENÇÃO</strong>.
                </Alert>
              ) : status === 'CONCLUIDA' && veiculoAtual.status === 'MANUTENCAO' ? (
                <Alert tone="success">
                  Como o status é <strong>Concluída</strong>, o veículo será liberado para{' '}
                  <strong>DISPONÍVEL</strong> automaticamente se não houver outras manutenções em
                  andamento.
                </Alert>
              ) : null}

              <ModalFooter>
                <Button variant="outline" type="button" onClick={() => setModoCriacao(false)}>
                  Voltar ao Histórico
                </Button>
                <Button variant="primary" type="submit">
                  Salvar Registro de Manutenção
                </Button>
              </ModalFooter>
            </ModalForm>
          </div>
        )}
      </div>
    </Modal>
  );
}
