import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button } from '../ui';
import { useAcessibilidade } from '../../contexts/AcessibilidadeContext';
import {
  iguaisAoPadrao,
  type Contraste,
  type EscalaTexto,
  type Movimento,
  type Paleta,
  type PreferenciasAcessibilidade,
} from '../../utils/preferenciasAcessibilidade';
import { cn } from '../../utils/cn';

type Opcao<V> = { valor: V; rotulo: string; detalhe?: string };

const TAMANHOS: Opcao<EscalaTexto>[] = [
  { valor: 0.875, rotulo: 'Menor', detalhe: '87,5%' },
  { valor: 1, rotulo: 'Padrão', detalhe: '100%' },
  { valor: 1.125, rotulo: 'Grande', detalhe: '112,5%' },
  { valor: 1.25, rotulo: 'Maior', detalhe: '125%' },
  { valor: 1.5, rotulo: 'Muito grande', detalhe: '150%' },
];

const CONTRASTES: Opcao<Contraste>[] = [
  { valor: 'padrao', rotulo: 'Padrão' },
  { valor: 'alto', rotulo: 'Alto contraste', detalhe: 'Textos e bordas mais escuros e foco reforçado' },
];

const MOVIMENTOS: Opcao<Movimento>[] = [
  { valor: 'sistema', rotulo: 'Seguir o aparelho' },
  { valor: 'reduzido', rotulo: 'Reduzir animações', detalhe: 'Painéis e avisos aparecem sem deslizar' },
];

const PALETAS_OPCOES: Opcao<Paleta>[] = [
  { valor: 'padrao', rotulo: 'Padrão' },
  { valor: 'protanopia', rotulo: 'Protanopia', detalhe: 'Dificuldade com o vermelho' },
  { valor: 'deuteranopia', rotulo: 'Deuteranopia', detalhe: 'Dificuldade com o verde' },
  { valor: 'tritanopia', rotulo: 'Tritanopia', detalhe: 'Dificuldade com o azul e o amarelo' },
];

function GrupoOpcoes<C extends keyof PreferenciasAcessibilidade>({
  campo,
  titulo,
  descricao,
  opcoes,
  colunas = 2,
  extra,
}: {
  campo: C;
  titulo: string;
  descricao?: string;
  opcoes: Opcao<PreferenciasAcessibilidade[C]>[];
  colunas?: 2 | 3;
  extra?: ReactNode;
}) {
  const { preferencias, alterar } = useAcessibilidade();
  const nome = useId();
  const idDescricao = `${nome}-descricao`;
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={descricao ? idDescricao : undefined}>
      <legend className="p-0 font-display text-sm font-semibold text-text">{titulo}</legend>
      {descricao && (
        <p id={idDescricao} className="mt-0.5 text-xs text-neutral">
          {descricao}
        </p>
      )}
      <div className={cn('mt-2 grid grid-cols-1 gap-2', colunas === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {opcoes.map(({ valor, rotulo, detalhe }, indice) => {
          const selecionado = preferencias[campo] === valor;
          // Nome só com o rótulo; o detalhe é lido como descrição, depois
          const idRotulo = `${nome}-${indice}`;
          const idDetalhe = detalhe ? `${nome}-${indice}-detalhe` : undefined;
          return (
            <label
              key={String(valor)}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                selecionado ? 'border-primary bg-primary-soft font-semibold text-text' : 'border-border bg-surface text-text-secondary',
              )}
            >
              <input
                type="radio"
                name={nome}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={selecionado}
                onChange={() => alterar(campo, valor)}
                aria-labelledby={idRotulo}
                aria-describedby={idDetalhe}
              />
              <span className="min-w-0">
                <span id={idRotulo} className="block">
                  {rotulo}
                </span>
                {detalhe && (
                  <span id={idDetalhe} className="block text-xs font-normal text-neutral">
                    {detalhe}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {extra}
    </fieldset>
  );
}

function usePrefereMenosMovimento() {
  const consulta = '(prefers-reduced-motion: reduce)';
  const [prefere, setPrefere] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const lista = window.matchMedia(consulta);
    const aoMudar = () => setPrefere(lista.matches);
    lista.addEventListener?.('change', aoMudar);
    return () => lista.removeEventListener?.('change', aoMudar);
  }, []);
  return prefere;
}

/**
 * Preferências de acessibilidade (SCRUM-305 e SCRUM-307). Tudo vale na hora, fica salvo no aparelho e é
 * separado por conta. Não mexe no tema nem nas preferências de alertas.
 */
export function SecaoAcessibilidade({
  toqueGrande = false,
  sozinha = false,
}: {
  toqueGrande?: boolean;
  /** Única coisa dentro de um diálogo já chamado Acessibilidade: sem título e sem moldura repetidos. */
  sozinha?: boolean;
}) {
  const { preferencias, restaurar } = useAcessibilidade();
  const aparelhoPedeMenosMovimento = usePrefereMenosMovimento();
  const [aviso, setAviso] = useState('');
  const padrao = iguaisAoPadrao(preferencias);
  const idTitulo = useId();

  return (
    <section
      aria-labelledby={sozinha ? undefined : idTitulo}
      aria-label={sozinha ? 'Acessibilidade' : undefined}
      className={cn('space-y-4', !sozinha && 'rounded-lg border border-border p-3.5')}
    >
      <div>
        {!sozinha && (
          <h3 id={idTitulo} className="font-display text-base font-semibold text-text">
            Acessibilidade
          </h3>
        )}
        <p className="mt-0.5 text-xs text-neutral">
          As mudanças valem na hora e ficam salvas neste aparelho para esta conta.
        </p>
      </div>

      <GrupoOpcoes
        campo="escalaTexto"
        titulo="Tamanho do texto"
        descricao="O zoom do navegador continua funcionando junto."
        opcoes={TAMANHOS}
        colunas={3}
      />
      <GrupoOpcoes campo="contraste" titulo="Contraste" opcoes={CONTRASTES} />
      <GrupoOpcoes
        campo="movimento"
        titulo="Animações"
        opcoes={MOVIMENTOS}
        extra={
          aparelhoPedeMenosMovimento && preferencias.movimento === 'sistema' ? (
            <p className="mt-2 text-xs text-neutral">Este aparelho já pede menos animação, e o sistema segue.</p>
          ) : null
        }
      />
      <GrupoOpcoes
        campo="paleta"
        titulo="Cores para daltonismo"
        descricao="Troca as cores de status. Fotos, documentos e mapas mantêm as cores reais."
        opcoes={PALETAS_OPCOES}
        extra={
          <div role="group" className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Exemplo de status com as cores escolhidas">
            <Badge tone="success">Aprovada</Badge>
            <Badge tone="danger">Recusada</Badge>
            <Badge tone="warning">Pendente</Badge>
            <Badge tone="info">Em andamento</Badge>
            <Badge tone="purple">Agendada</Badge>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={toqueGrande ? 'min-h-11' : undefined}
          disabled={padrao}
          onClick={() => {
            restaurar();
            setAviso('Preferências de acessibilidade restauradas.');
          }}
        >
          Restaurar padrões
        </Button>
        <p role="status" className="text-xs text-neutral">
          {aviso}
        </p>
      </div>
    </section>
  );
}
