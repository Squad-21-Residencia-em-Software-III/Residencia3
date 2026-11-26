import type { ReactNode } from 'react';
import { BellRing } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, type BadgeTone } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useAssinaturaPush, type SituacaoPush } from '../../hooks/useAssinaturaPush';
import type { EstadoPermissao } from '../../hooks/usePermissoesDispositivo';
import { usePreferenciasPush } from '../../hooks/usePreferenciasPush';
import { cn } from '../../utils/cn';

interface AlertasPushProps {
  online: boolean;
  /** iPhone/iPad no navegador, sem o aplicativo instalado. */
  iosSemInstalar: boolean;
  permissao: EstadoPermissao;
  solicitarPermissao: () => Promise<EstadoPermissao>;
  /** Motorista no celular: áreas de toque maiores. */
  toqueGrande?: boolean;
}

const SELO: Partial<Record<SituacaoPush, { rotulo: string; tom: BadgeTone }>> = {
  ativa: { rotulo: 'Ligados', tom: 'success' },
  inativa: { rotulo: 'Desligados', tom: 'neutral' },
  bloqueada: { rotulo: 'Bloqueados', tom: 'danger' },
  indisponivel: { rotulo: 'Indisponíveis', tom: 'warning' },
};

/** Alertas no aparelho (Web Push): ligar e desligar por escolha do usuário e categorias da conta. */
export function AlertasPush({
  online, iosSemInstalar, permissao, solicitarPermissao, toqueGrande = false,
}: AlertasPushProps) {
  const { usuario } = useAuth();
  const push = useAssinaturaPush({ usuarioId: usuario?.id, online, permissao, solicitarPermissao });
  const { situacao } = push;
  const selo = SELO[situacao];
  const classeBotao = cn('w-full sm:w-auto', toqueGrande ? 'min-h-13 sm:w-full' : 'min-h-11');

  return (
    <section aria-labelledby="titulo-alertas-push" className="space-y-3 rounded-lg border border-border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <BellRing size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h3 id="titulo-alertas-push" className="font-display text-sm font-semibold text-text">
              Alertas neste aparelho
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Avisam mesmo com o sistema fechado. Os avisos dentro do sistema não dependem desta opção.
            </p>
          </div>
        </div>
        {selo && <Badge tone={selo.tom}>{selo.rotulo}</Badge>}
      </div>

      {!online && (
        <Alert tone="warning">Sem conexão. Conecte-se à internet para mudar os alertas.</Alert>
      )}
      {online && situacao === 'verificando' && (
        <p role="status" className="text-xs text-text-muted">Verificando este aparelho...</p>
      )}
      {situacao === 'bloqueada' && (
        <Alert tone="warning">
          O navegador está bloqueando os alertas. Para ligar, permita as notificações deste site nas configurações
          do navegador ou do aparelho.
        </Alert>
      )}
      {situacao === 'indisponivel' && (
        <Alert tone="info">
          {iosSemInstalar
            ? 'No iPhone e no iPad, os alertas só funcionam com o aplicativo instalado. Adicione à Tela de Início e abra por lá.'
            : 'Este navegador não recebe alertas. Use a versão mais recente do Chrome, do Edge, do Firefox ou do Safari.'}
        </Alert>
      )}
      {push.erro && <Alert tone="danger">{push.erro}</Alert>}

      {situacao === 'inativa' && (
        <Button
          type="button"
          className={classeBotao}
          disabled={!online || push.ocupado}
          aria-busy={push.ocupado}
          onClick={() => void push.ligar()}
        >
          {push.ocupado ? 'Ligando...' : 'Ligar alertas'}
        </Button>
      )}
      {situacao === 'ativa' && (
        <Button
          type="button"
          variant="outline"
          className={classeBotao}
          disabled={!online || push.ocupado}
          aria-busy={push.ocupado}
          onClick={() => void push.desligar()}
        >
          {push.ocupado ? 'Desligando...' : 'Desligar neste aparelho'}
        </Button>
      )}
      {situacao === 'falha' && (
        <Button
          type="button"
          variant="outline"
          className={classeBotao}
          disabled={!online}
          onClick={() => void push.verificar()}
        >
          Tentar novamente
        </Button>
      )}

      <Categorias usuarioId={usuario?.id} online={online} classeBotao={classeBotao} />
    </section>
  );
}

function Categorias({
  usuarioId, online, classeBotao,
}: { usuarioId: number | undefined; online: boolean; classeBotao: string }) {
  const { categorias, salvando, erroCarga, erro, carregar, alternar } = usePreferenciasPush(usuarioId, online);

  let conteudo: ReactNode;
  if (categorias === null) {
    if (!online) return null;
    conteudo = erroCarga ? (
      <div className="space-y-2">
        <Alert tone="danger">{erroCarga}</Alert>
        <Button type="button" variant="outline" className={classeBotao} onClick={() => void carregar()}>
          Carregar categorias de novo
        </Button>
      </div>
    ) : (
      <p role="status" className="text-xs text-text-muted">Carregando categorias...</p>
    );
  } else if (categorias.length === 0) {
    conteudo = <p className="text-xs text-text-muted">Nenhuma categoria disponível para o seu perfil.</p>;
  } else {
    conteudo = (
      <div className="flex flex-col">
        {categorias.map((c) => (
          <Checkbox
            key={c.codigo}
            className="min-h-11 items-start py-2.5 [&>input]:size-5"
            checked={c.push}
            disabled={!online || salvando.has(c.codigo)}
            onChange={() => void alternar(c)}
          >
            <span className="block font-semibold">{c.titulo}</span>
            {c.descricao && <span className="block text-xs text-text-muted">{c.descricao}</span>}
          </Checkbox>
        ))}
      </div>
    );
  }

  return (
    <fieldset className="m-0 space-y-2 border-0 border-t border-divider p-0 pt-3">
      <legend className="sr-only">Categorias de alerta</legend>
      <p aria-hidden="true" className="text-xs font-semibold text-text">O que você quer receber</p>
      <p className="text-xs text-text-muted">Vale para a sua conta, em todos os aparelhos com alertas ligados.</p>
      {erro && <Alert tone="danger">{erro}</Alert>}
      {conteudo}
    </fieldset>
  );
}
