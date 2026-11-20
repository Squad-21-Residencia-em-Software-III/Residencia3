import { useCallback, useEffect, useState } from 'react';

export type EstadoPermissao = 'granted' | 'denied' | 'prompt' | 'unsupported';

function lerEstadoNotificacoes(): EstadoPermissao {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  const perm = Notification.permission;
  return perm === 'default' ? 'prompt' : perm;
}

/**
 * Prepara os pedidos opt-in de permissões do dispositivo (Notificações e Geolocalização)
 * para futuras funcionalidades nativas, sem disparar pop-ups automáticos sem ação do usuário.
 */
export function usePermissoesDispositivo() {
  const [notificacoes, setNotificacoes] = useState<EstadoPermissao>(lerEstadoNotificacoes);
  const [geolocalizacao, setGeolocalizacao] = useState<EstadoPermissao>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'prompt' : 'unsupported',
  );
  const [solicitandoNotif, setSolicitandoNotif] = useState(false);
  const [solicitandoGeo, setSolicitandoGeo] = useState(false);

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.permissions?.query !== 'function'
    ) {
      return;
    }

    let ativo = true;
    let statusGeo: PermissionStatus | null = null;

    try {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (!ativo) return;
          statusGeo = status;
          setGeolocalizacao(status.state as EstadoPermissao);
          status.onchange = () => {
            if (ativo) setGeolocalizacao(status.state as EstadoPermissao);
          };
        })
        .catch(() => {
          // Fallback silencioso para navegadores sem suporte a permissions.query('geolocation')
        });
    } catch {
      // Safari antigo pode lançar exceção síncrona ao consultar 'geolocation'
    }

    return () => {
      ativo = false;
      if (statusGeo) statusGeo.onchange = null;
    };
  }, []);

  const solicitarNotificacoes = useCallback(async (): Promise<EstadoPermissao> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificacoes('unsupported');
      return 'unsupported';
    }
    setSolicitandoNotif(true);
    try {
      const resultado = await Notification.requestPermission();
      const normalizado: EstadoPermissao = resultado === 'default' ? 'prompt' : resultado;
      setNotificacoes(normalizado);
      return normalizado;
    } finally {
      setSolicitandoNotif(false);
    }
  }, []);

  const solicitarGeolocalizacao = useCallback(async (): Promise<EstadoPermissao> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeolocalizacao('unsupported');
      return 'unsupported';
    }
    setSolicitandoGeo(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setGeolocalizacao('granted');
          setSolicitandoGeo(false);
          resolve('granted');
        },
        (erro) => {
          const proximo: EstadoPermissao =
            erro.code === erro.PERMISSION_DENIED ? 'denied' : 'prompt';
          setGeolocalizacao(proximo);
          setSolicitandoGeo(false);
          resolve(proximo);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    });
  }, []);

  return {
    notificacoes,
    geolocalizacao,
    solicitandoNotif,
    solicitandoGeo,
    solicitarNotificacoes,
    solicitarGeolocalizacao,
  };
}
