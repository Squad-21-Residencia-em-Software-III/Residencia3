import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { Button } from '../ui';

interface StopSignIllustrationProps {
  code?: string;
  signColor?: string;
  poleColor?: string;
}

function StopSignIllustration({
  code = '404',
  signColor = '#DC2626',
  poleColor = '#94A3B8',
}: StopSignIllustrationProps) {
  return (
    <svg
      width="280"
      height="220"
      viewBox="0 0 280 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible', margin: '0 auto 16px' }}
      aria-hidden="true"
    >
      {/* Nuvens decorativas estilizadas em traço vetorial limpo */}
      <g stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Nuvem esquerda superior */}
        <path d="M 45 42 H 78 C 82 42, 85 38, 83 34 C 81 29, 74 28, 71 31 C 68 25, 58 25, 54 30 C 50 30, 42 34, 45 42 Z" />
        <line x1="38" y1="42" x2="42" y2="42" />
        <line x1="82" y1="42" x2="90" y2="42" />

        {/* Nuvem direita */}
        <path d="M 195 95 H 228 C 232 95, 235 91, 233 87 C 231 82, 224 81, 221 84 C 218 78, 208 78, 204 83 C 200 83, 192 87, 195 95 Z" />
        <line x1="188" y1="95" x2="192" y2="95" />
        <line x1="232" y1="95" x2="242" y2="95" />
      </g>

      {/* Poste metálico com sombreado */}
      <rect x="136" y="95" width="8" height="95" rx="2" fill={poleColor} />
      <rect x="139" y="95" width="3" height="95" fill="#64748B" opacity="0.3" />

      {/* Parafusos visíveis do suporte do poste */}
      <circle cx="140" cy="38" r="1.5" fill="#64748B" />
      <circle cx="140" cy="100" r="1.5" fill="#64748B" />

      {/* Placa Octogonal (Pare) */}
      <g filter="drop-shadow(0px 8px 16px rgba(15, 23, 42, 0.12))">
        {/* Octógono Externo (Borda Branca) */}
        <polygon
          points="
            116,14  164,14
            196,44  196,92
            164,122 116,122
            84,92   84,44
          "
          fill="#FFFFFF"
          stroke="#E2E8F0"
          strokeWidth="1.5"
        />

        {/* Octógono Principal (Vermelho ou Tom do Erro) */}
        <polygon
          points="
            118,18  162,18
            192,46  192,90
            162,118 118,118
            88,90   88,46
          "
          fill={signColor}
        />

        {/* Filete Interno Branco Clássico de Sinalização de Trânsito */}
        <polygon
          points="
            120,22  160,22
            188,48  188,88
            160,114 120,114
            92,88   92,48
          "
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Código Numérico em Negrito no Centro (404, 500, 403) */}
        <text
          x="140"
          y="76"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="system-ui, -apple-system, 'Plus Jakarta Sans', sans-serif"
          fontWeight="900"
          fontSize="30"
          letterSpacing="-0.03em"
        >
          {code}
        </text>
      </g>

      {/* Linha de Chão / Asfalto Pontilhado */}
      <g stroke="#334155" strokeWidth="3" strokeLinecap="round">
        <line x1="75" y1="190" x2="105" y2="190" />
        <line x1="115" y1="190" x2="165" y2="190" />
        <line x1="175" y1="190" x2="205" y2="190" />
      </g>
    </svg>
  );
}

export interface ErrorLayoutProps {
  code: string;
  title: string;
  description: string;
  icon?: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  signColor?: string;
  primaryAction?: {
    label: string;
    onClick?: () => void;
    to?: string;
    icon?: 'home' | 'refresh';
  };
  showBackButton?: boolean;
}

export function ErrorLayout({
  code,
  title,
  description,
  signColor = '#DC2626',
  primaryAction = { label: 'Ir para o Início', to: '/inicio', icon: 'home' },
  showBackButton = true,
}: ErrorLayoutProps) {
  const navigate = useNavigate();

  const handlePrimaryClick = () => {
    if (primaryAction.onClick) {
      primaryAction.onClick();
    } else if (primaryAction.to) {
      navigate(primaryAction.to);
    } else {
      navigate('/inicio');
    }
  };

  const PrimaryIcon = primaryAction.icon === 'refresh' ? RefreshCw : Home;

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
        background: `
          radial-gradient(ellipse 70% 50% at 50% 15%, rgba(21, 84, 184, 0.05), transparent 70%),
          radial-gradient(ellipse 50% 40% at 85% 85%, rgba(226, 232, 240, 0.6), transparent 70%),
          linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 50%, #E2E8F0 100%)
        `,
        boxSizing: 'border-box',
        fontFamily: 'var(--font-sans)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Elementos decorativos de fundo suaves (bolinhas com tons de anil e cinza claro) */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          left: '12%',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(21, 84, 184, 0.06)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '18%',
          right: '18%',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          backgroundColor: '#E2E8F0',
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '22%',
          left: '16%',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          backgroundColor: '#E2E8F0',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '15%',
          right: '14%',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'rgba(21, 84, 184, 0.05)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* FSPH PIN Institucional Centralizado */}
        <div style={{ marginBottom: '24px' }}>
          <img
            src="/assets/FSPH_PIN.png"
            alt="FSPH - Fundação de Saúde Parreiras Horta"
            style={{
              height: '56px',
              maxWidth: '100%',
              objectFit: 'contain',
            }}
          />
        </div>

        {/* Ilustração Vetorial da Placa de Pare de Trânsito */}
        <StopSignIllustration code={code} signColor={signColor} />

        {/* Título Principal */}
        <h1
          style={{
            margin: '4px 0 8px',
            fontSize: '24px',
            fontWeight: 800,
            color: 'var(--color-text)',
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>

        {/* Descrição Amigável */}
        <p
          style={{
            margin: '0 0 28px',
            fontSize: '14px',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.55,
            maxWidth: '400px',
          }}
        >
          {description}
        </p>

        {/* Botões de Ação */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: '100%',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="primary"
            size="md"
            onClick={handlePrimaryClick}
            style={{ minWidth: '170px', justifyContent: 'center' }}
          >
            <PrimaryIcon size={16} style={{ marginRight: '8px' }} />
            {primaryAction.label}
          </Button>

          {showBackButton && (
            <Button
              variant="outline"
              size="md"
              onClick={() => navigate(-1)}
              style={{ minWidth: '170px', justifyContent: 'center' }}
            >
              <ArrowLeft size={16} style={{ marginRight: '8px' }} />
              Voltar
            </Button>
          )}
        </div>

        {/* Rodapé Corporativo Sutil */}
        <div
          style={{
            marginTop: '36px',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            lineHeight: 1.4,
          }}
        >
          Sistema Integrado de Gestão de Frotas • FSPH
        </div>
      </div>
    </div>
  );
}
