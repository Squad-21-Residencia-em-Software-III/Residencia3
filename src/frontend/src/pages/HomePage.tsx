import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Fuel,
  Route,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { Button, Card, IdBadge, Badge } from '../components/ui';
import { storageService } from '../services/storageService';
import './home.css';

function cnhVencida(validade: string): boolean {
  return validade < new Date().toISOString().slice(0, 10);
}

export default function HomePage() {
  const navigate = useNavigate();

  const dados = useMemo(() => {
    const veiculos = storageService.getVeiculos();
    const motoristas = storageService.getMotoristas();

    const pendentes = storageService.getSolicitacoesPendentes();
    const motoristasIrregulares = motoristas.filter((m) => cnhVencida(m.validade_cnh));
    const veiculosManutencao = veiculos.filter((v) => v.status === 'MANUTENCAO');
    const totalAlertas = motoristasIrregulares.length + veiculosManutencao.length;

    return {
      pendentes,
      motoristasIrregulares,
      veiculosManutencao,
      totalAlertas,
    };
  }, []);

  return (
    <div className="home-container">
      {/* 1. Header da Central de Operações */}
      <div className="home-header">
        <h1 className="home-header__title">
          Central de Operações da Frota
        </h1>
        <p className="home-header__subtitle">
          Ações prioritárias para manter veículos liberados e viagens sem atrito.
        </p>
      </div>

      {/* 2. Ações Rápidas (Atalhos Funcionais com Micro-interações) */}
      <div className="home-shortcuts-section">
        <div className="home-section-tag">
          Ações Rápidas
        </div>
        <div className="home-shortcuts-grid">
          <button
            onClick={() => navigate('/solicitacoes')}
            className="home-shortcut-card"
          >
            <div className="home-shortcut-card__icon">
              <Route size={18} />
            </div>
            <div>
              <div className="home-shortcut-card__title">Nova Solicitação</div>
              <div className="home-shortcut-card__desc">Cadastrar ou analisar pedido</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/abastecimento')}
            className="home-shortcut-card"
          >
            <div className="home-shortcut-card__icon">
              <Fuel size={18} />
            </div>
            <div>
              <div className="home-shortcut-card__title">Registrar Abastecimento</div>
              <div className="home-shortcut-card__desc">Lançar cupom e KM</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/agenda')}
            className="home-shortcut-card"
          >
            <div className="home-shortcut-card__icon">
              <Calendar size={18} />
            </div>
            <div>
              <div className="home-shortcut-card__title">Ver Agenda</div>
              <div className="home-shortcut-card__desc">Cronograma de saídas</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/veiculos')}
            className="home-shortcut-card"
          >
            <div className="home-shortcut-card__icon">
              <Truck size={18} />
            </div>
            <div>
              <div className="home-shortcut-card__title">Gestão de Veículos</div>
              <div className="home-shortcut-card__desc">Pátio e manutenções</div>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Painéis Principais: Fila de Decisão & Regularidade */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-5)' }}>
        {/* Painel: Fila de Aprovação */}
        <Card style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Clock size={18} color="var(--color-warning)" />
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>
                Fila de Aprovação
              </h2>
            </div>
            <Badge tone={dados.pendentes.length > 0 ? 'warning' : 'neutral'}>
              {dados.pendentes.length} pendente{dados.pendentes.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {dados.pendentes.length === 0 ? (
            <div style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <CheckCircle2 size={32} color="var(--color-success)" style={{ margin: '0 auto var(--space-2)', display: 'block' }} />
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-strong)' }}>Fila limpa</p>
              <span style={{ fontSize: '12px' }}>Nenhuma solicitação aguardando despacho no momento.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {dados.pendentes.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className="home-queue-row"
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '2px' }}>
                      <IdBadge id={`#${s.id}`} />
                      <strong style={{ fontSize: '13px', color: 'var(--color-text)' }}>{s.solicitante_nome}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {s.origem} → {s.destino}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="home-btn-action"
                    onClick={() => navigate('/solicitacoes')}
                  >
                    Analisar
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)' }}>
            <Button
              variant="outline"
              size="sm"
              className="home-btn-action"
              onClick={() => navigate('/viagens')}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Gerenciar Todas as Viagens <ArrowRight size={13} style={{ marginLeft: '4px' }} />
            </Button>
          </div>
        </Card>

        {/* Painel: Bloqueios Operacionais */}
        <Card style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <ShieldAlert size={18} color={dados.totalAlertas > 0 ? 'var(--color-danger)' : 'var(--color-success)'} />
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>
                Bloqueios & Regularidade
              </h2>
            </div>
            {dados.totalAlertas > 0 && (
              <Badge tone="danger">{dados.totalAlertas} atenção</Badge>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* CNHs */}
            <div
              className={`home-alert-block ${dados.motoristasIrregulares.length > 0 ? 'home-alert-block--danger' : ''}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: dados.motoristasIrregulares.length > 0 ? 'var(--color-danger-strong)' : 'var(--color-text)' }}>
                    Motoristas com CNH Vencida
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {dados.motoristasIrregulares.length === 0
                      ? 'Nenhum condutor com restrição de habilitação.'
                      : `${dados.motoristasIrregulares.length} motorista(s) impedidos de conduzir.`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="home-btn-action"
                  onClick={() => navigate('/motoristas')}
                >
                  Ver
                </Button>
              </div>
            </div>

            {/* Veículos em Oficina */}
            <div
              className="home-alert-block"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text)' }}>
                    Veículos em Manutenção
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {dados.veiculosManutencao.length === 0
                      ? 'Toda a frota operacional ativa no pátio.'
                      : `${dados.veiculosManutencao.length} veículo(s) retidos para reparo/revisão.`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="home-btn-action"
                  onClick={() => navigate('/veiculos')}
                >
                  Ver
                </Button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Deseja consultar os relatórios consolidados?
              </span>
              <Button
                variant="outline"
                size="sm"
                className="home-btn-action"
                onClick={() => navigate('/dashboard')}
              >
                Abrir Relatórios
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
