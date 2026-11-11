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
      className="mx-auto mb-4 overflow-visible"
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
  icon?: ComponentType<{ size?: number; className?: string }>;
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
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 p-6 font-sans">
      {/* Elementos decorativos de fundo suaves (bolinhas com tons de anil e cinza claro) */}
      <div className="pointer-events-none absolute top-[8%] left-[12%] h-14 w-14 rounded-full bg-primary/6" />
      <div className="pointer-events-none absolute top-[18%] right-[18%] h-11 w-11 rounded-full bg-slate-200/70" />
      <div className="pointer-events-none absolute bottom-[22%] left-[16%] h-10 w-10 rounded-full bg-slate-200/60" />
      <div className="pointer-events-none absolute right-[14%] bottom-[15%] h-15 w-15 rounded-full bg-primary/5" />

      <div className="relative z-10 flex w-full max-w-[540px] flex-col items-center text-center">
        {/* FSPH PIN Institucional Centralizado */}
        <div className="mb-6">
          <img
            src="/assets/FSPH_PIN.png"
            alt="FSPH - Fundação de Saúde Parreiras Horta"
            className="h-14 max-w-full object-contain"
          />
        </div>

        {/* Ilustração Vetorial da Placa de Pare de Trânsito */}
        <StopSignIllustration code={code} signColor={signColor} />

        {/* Título Principal */}
        <h1 className="mt-1 mb-2 font-display text-2xl font-extrabold tracking-tight text-slate-900">
          {title}
        </h1>

        {/* Descrição Amigável */}
        <p className="mb-7 max-w-[400px] text-sm leading-relaxed text-slate-600">
          {description}
        </p>

        {/* Botões de Ação */}
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={handlePrimaryClick}
            className="min-w-[170px] justify-center"
          >
            <PrimaryIcon size={16} className="mr-2" />
            {primaryAction.label}
          </Button>

          {showBackButton && (
            <Button
              variant="outline"
              size="md"
              onClick={() => navigate(-1)}
              className="min-w-[170px] justify-center"
            >
              <ArrowLeft size={16} className="mr-2" />
              Voltar
            </Button>
          )}
        </div>

        {/* Rodapé Corporativo Sutil */}
        <div className="mt-9 text-[11px] leading-snug text-slate-500">
          Sistema Integrado de Gestão de Frotas • FSPH
        </div>
      </div>
    </div>
  );
}
