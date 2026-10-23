import { useMemo, useState } from 'react';
import { Avatar, Badge, Card, IdBadge, Pagination, Table, TableToolbar } from '../components/ui';
import type { Motorista, TipoMotorista } from '../types/motorista';
import { storageService } from '../services/storageService';
import { ModalMotorista } from './motoristas/ModalMotorista';

type Filtro = 'TODOS' | TipoMotorista;

function cnhVencida(validade: string) {
  return validade < new Date().toISOString().slice(0, 10);
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

const cardValor = (cor: string) => ({
  fontSize: '24px',
  fontWeight: 800,
  color: cor,
  fontFamily: 'var(--font-display)',
});
const cardRotulo = { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' };

export default function MotoristasPage() {
  const [motoristas, setMotoristas] = useState<Motorista[]>(storageService.getMotoristas());
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [modalAberto, setModalAberto] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const exibirFeedback = (msg: string, isError = false) => {
    if (isError) {
      setMensagemErro(msg);
      setMensagemSucesso(null);
    } else {
      setMensagemSucesso(msg);
      setMensagemErro(null);
    }
    setTimeout(() => {
      setMensagemSucesso(null);
      setMensagemErro(null);
    }, 4000);
  };

  const totais = useMemo(
    () => ({
      total: motoristas.length,
      frota: motoristas.filter((m) => m.tipo_motorista === 'FROTA').length,
      svo: motoristas.filter((m) => m.tipo_motorista === 'SVO').length,
      vencidas: motoristas.filter((m) => cnhVencida(m.validade_cnh)).length,
    }),
    [motoristas],
  );

  const filtrados = useMemo(
    () => (filtro === 'TODOS' ? motoristas : motoristas.filter((m) => m.tipo_motorista === filtro)),
    [motoristas, filtro],
  );

  const handleSalvar = (novo: Omit<Motorista, 'id' | 'usuario_id'>) => {
    try {
      storageService.createMotorista(novo);
      setMotoristas(storageService.getMotoristas());
      exibirFeedback(`Motorista ${novo.nome} cadastrado com sucesso!`);
    } catch (error: any) {
      exibirFeedback(error.message, true);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Feedback de sucesso e erro */}
      {(mensagemSucesso || mensagemErro) && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            border: `1px solid ${mensagemErro ? 'var(--color-danger)' : 'var(--color-success)'}`,
            color: mensagemErro ? 'var(--color-danger)' : 'var(--color-success)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mensagemErro ? '❌' : '✅'} {mensagemErro || mensagemSucesso}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-text)')}>{totais.total}</div>
          <div style={cardRotulo}>Total de Motoristas</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-primary)')}>{totais.frota}</div>
          <div style={cardRotulo}>Frota</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-purple)')}>{totais.svo}</div>
          <div style={cardRotulo}>SVO</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-danger)')}>{totais.vencidas}</div>
          <div style={cardRotulo}>CNH Vencida</div>
        </Card>
      </div>

      <Card>
        <TableToolbar
          title="Motoristas"
          subtitle={`${filtrados.length} motoristas listados`}
          newLabel="Novo Motorista"
          onNew={() => setModalAberto(true)}
        />

        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            borderBottom: '1px solid var(--color-divider)',
            background: 'var(--color-surface-alt)',
          }}
        >
          {(['TODOS', 'FROTA', 'SVO'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                background: filtro === f ? 'var(--color-primary)' : 'transparent',
                color: filtro === f ? '#fff' : 'var(--color-text-secondary)',
                border: '1px solid',
                borderColor: filtro === f ? 'var(--color-primary)' : 'var(--color-border)',
                transition: 'all 0.15s ease',
              }}
            >
              {f === 'TODOS' ? 'Todos' : f === 'SVO' ? 'Motoristas SVO' : 'Motoristas Frota'}
            </button>
          ))}
        </div>

        <Table>
          <thead>
            <tr>
              <th>Motorista</th>
              <th>Número da CNH</th>
              <th>Categoria</th>
              <th>Validade da CNH</th>
              <th>Tipo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                  Nenhum motorista encontrado para este filtro.
                </td>
              </tr>
            ) : (
              filtrados.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={m.nome} />
                      <strong style={{ color: 'var(--color-text-strong)', fontWeight: 600 }}>{m.nome}</strong>
                    </span>
                  </td>
                  <td>
                    <IdBadge id={m.numero_cnh} />
                  </td>
                  <td>{m.categoria_cnh}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {formatarData(m.validade_cnh)}
                      {cnhVencida(m.validade_cnh) && <Badge tone="danger">Vencida</Badge>}
                    </span>
                  </td>
                  <td>
                    <Badge tone={m.tipo_motorista === 'SVO' ? 'purple' : 'neutral'}>{m.tipo_motorista}</Badge>
                  </td>
                  <td>
                    <Badge tone="success">Disponível</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <Pagination showing={`1–${filtrados.length}`} total={filtrados.length} />
        </Table>
      </Card>

      {modalAberto && (
        <ModalMotorista
          cnhsExistentes={motoristas.map((m) => m.numero_cnh)}
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvar}
        />
      )}
    </div>
  );
}
