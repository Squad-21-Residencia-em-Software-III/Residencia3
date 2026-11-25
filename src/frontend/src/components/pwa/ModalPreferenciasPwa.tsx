import { Bell, Download, MapPin, Share, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { Badge, Button, Modal } from '../ui';
import type { BadgeTone } from '../ui';
import { recursoAtivo } from '../../config/recursosBackend';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  usePermissoesDispositivo,
  type EstadoPermissao,
} from '../../hooks/usePermissoesDispositivo';
import { AlertasPush } from './AlertasPush';

type ModalPreferenciasPwaProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Motorista no celular: abre presa à parte de baixo da tela. */
  folhaInferior?: boolean;
};

const ROTULO_PERMISSAO: Record<EstadoPermissao, { label: string; tone: BadgeTone }> = {
  granted: { label: 'Permitida', tone: 'success' },
  denied: { label: 'Bloqueada', tone: 'danger' },
  prompt: { label: 'Não solicitada', tone: 'neutral' },
  unsupported: { label: 'Indisponível', tone: 'warning' },
};

/**
 * Central de preferências do aplicativo (PWA): status de rede, instalação
 * e preparação opt-in de permissões de Notificações e Localização.
 */
export function ModalPreferenciasPwa({ isOpen, onClose, folhaInferior = false }: ModalPreferenciasPwaProps) {
  const online = useOnlineStatus();
  const { podeInstalar, instalado, mostrarGuiaIos, instalar } = useInstallPrompt();
  const {
    notificacoes,
    geolocalizacao,
    solicitandoNotif,
    solicitandoGeo,
    solicitarNotificacoes,
    solicitarGeolocalizacao,
  } = usePermissoesDispositivo();

  const webPush = recursoAtivo('webPush');
  const botaoToque = folhaInferior ? 'min-h-11' : undefined;
  const badgeNotif = ROTULO_PERMISSAO[notificacoes];
  const badgeGeo = ROTULO_PERMISSAO[geolocalizacao];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preferências do Aplicativo"
      hideFooter
      maxWidth={folhaInferior ? undefined : 520}
      telaInteira={folhaInferior}
      ajustarAoTeclado={folhaInferior}
      folhaInferior={folhaInferior}
    >
      <div className="space-y-4 text-sm text-text">
        {/* Status de conectividade */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            {online ? (
              <Wifi size={16} className="text-success" aria-hidden="true" />
            ) : (
              <WifiOff size={16} className="text-warning" aria-hidden="true" />
            )}
            <span className="font-medium">Conexão com o servidor</span>
          </div>
          <Badge tone={online ? 'success' : 'warning'}>
            {online ? 'Online' : 'Offline'}
          </Badge>
        </div>

        {/* Instalação do PWA */}
        <div className="rounded-lg border border-border p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Smartphone size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-display font-semibold text-text">Aplicativo instalado (PWA)</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Acesse rapidamente pela tela inicial do seu celular ou computador.
                </p>
              </div>
            </div>
            {instalado && <Badge tone="success">Instalado</Badge>}
          </div>

          {podeInstalar && (
            <div className="mt-3">
              <Button
                type="button"
                variant="primary"
                size="sm" className={botaoToque}
                onClick={() => void instalar()}
              >
                <Download size={14} aria-hidden="true" />
                Instalar aplicativo
              </Button>
            </div>
          )}

          {mostrarGuiaIos && (
            <p className="mt-2.5 flex items-center gap-1.5 rounded-md bg-info-bg/60 px-2.5 py-2 text-xs text-info">
              <Share size={14} className="shrink-0" aria-hidden="true" />
              <span>
                No iPhone/iPad, toque em <strong>Compartilhar</strong> e depois em{' '}
                <strong>Adicionar à Tela de Início</strong>.
              </span>
            </p>
          )}
        </div>

        {webPush && (
          <AlertasPush
            online={online}
            iosSemInstalar={mostrarGuiaIos}
            permissao={notificacoes}
            solicitarPermissao={solicitarNotificacoes}
            toqueGrande={folhaInferior}
          />
        )}

        {/* Permissões do Dispositivo (preparação para futuras funcionalidades) */}
        <div className="space-y-3 rounded-lg border border-border p-3.5">
          <div>
            <p className="font-display font-semibold text-text">Permissões do dispositivo</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {webPush
                ? 'Deixe o aparelho preparado para os recursos de localização em campo.'
                : 'Deixe o aparelho preparado para os recursos de alertas e localização em campo.'}
            </p>
          </div>

          {/* Notificações: com o Web Push ligado, ficam em `AlertasPush` */}
          {!webPush && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
            <div className="flex items-center gap-2.5">
              <Bell size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-text">Notificações</p>
                <p className="text-xs text-text-muted">Avisos sobre viagens e coletas SVO.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={badgeNotif.tone}>{badgeNotif.label}</Badge>
              {notificacoes === 'prompt' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm" className={botaoToque}
                  disabled={solicitandoNotif}
                  onClick={() => void solicitarNotificacoes()}
                >
                  {solicitandoNotif ? 'Solicitando...' : 'Ativar'}
                </Button>
              )}
            </div>
          </div>}

          {/* Geolocalização */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
            <div className="flex items-center gap-2.5">
              <MapPin size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-text">Localização (GPS)</p>
                <p className="text-xs text-text-muted">Registro de chegada e partidas em campo.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={badgeGeo.tone}>{badgeGeo.label}</Badge>
              {geolocalizacao === 'prompt' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm" className={botaoToque}
                  disabled={solicitandoGeo}
                  onClick={() => void solicitarGeolocalizacao()}
                >
                  {solicitandoGeo ? 'Solicitando...' : 'Ativar'}
                </Button>
              )}
            </div>
          </div>

          {((!webPush && notificacoes === 'denied') || geolocalizacao === 'denied') && (
            <p className="text-xs text-text-muted">
              Permissões bloqueadas podem ser reativadas nas configurações do site no seu navegador.
            </p>
          )}
        </div>
        {folhaInferior && (
          <Button type="button" variant="outline" className="min-h-13 w-full" onClick={onClose}>
            Voltar
          </Button>
        )}
      </div>
    </Modal>
  );
}
