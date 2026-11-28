import { recursoAtivo } from '../../config/recursosBackend';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { CENTRO_PADRAO_SERGIPE, type VisaoInicialMapa } from '../../config/mapas';
import { ApiError, CODIGO_CANCELADO } from '../../services/api/http';
import { mapasApi } from '../../services/api/mapasApi';
import type {
  CoordenadaMapa,
  EnderecoMapa,
  LocalSelecionado,
  OperacaoMapa,
  OrigemLocalSelecionado,
  UnidadeInstitucional,
} from '../../types/mapa';
import { cn } from '../../utils/cn';
import {
  UNIDADES_INSTITUCIONAIS,
  aplicarMascaraCepSeAplicavel,
  arredondarCoordenada,
  consultaTextoValidaParaBusca,
  coordenadaForaDeSergipe,
  determinarForaDeSergipe,
  extrairCepValido,
  formatarEnderecoMapa,
} from '../../utils/localizacaoMapa';
import { MapaBase } from './MapaBase';

export type ExibicaoMapa = 'expansivel' | 'aberto';

export interface SeletorLocalMapaProps {
  id?: string;
  /** Identifica o registro quando o mesmo seletor é reutilizado pelo formulário. */
  chaveRegistro?: string | number;
  label?: string;
  placeholder?: string;
  /** Endereço textual controlado pelo formulário pai. */
  valor: string;
  /** Coordenadas controladas (null quando apenas texto manual). */
  coordenadas?: CoordenadaMapa | null;
  /** Disparado sempre que o endereço ou as coordenadas mudam. */
  onChange: (valor: string, coordenadas: CoordenadaMapa | null) => void;
  /** Disparado apenas quando o usuário confirma um ponto (busca, CEP, atalho, mapa ou GPS). */
  onSelecaoConfirmada?: (local: LocalSelecionado) => void;
  operacao?: OperacaoMapa;
  modoPublico?: boolean;
  /**
   * `aberto`: mapa visível desde o início (Portal Público, Gestão de Unidades).
   * `expansivel`: mapa recolhido por padrão sob botão "Abrir mapa" (Triagem, Solicitações, Agendamentos).
   */
  exibicaoMapa?: ExibicaoMapa;
  /** Default: `true` no modo interno e `false` no `modoPublico`. */
  exibirAtalhosUnidades?: boolean;
  /** Default: `true`. */
  exibirBotaoGps?: boolean;
  alturaMapa?: string;
  desabilitado?: boolean;
  obrigatorio?: boolean;
  erro?: string;
  dica?: string;
  className?: string;
}

const DEBOUNCE_BUSCA_MS = 400;
const ZOOM_SELECAO = 16;

type AvisoStatus = {
  tom: 'info' | 'alerta';
  texto: string;
};

function mensagemErroBusca(erro: unknown): AvisoStatus | null {
  if (erro instanceof ApiError) {
    if (erro.codigo === CODIGO_CANCELADO) return null;
    if (erro.status === 404 && erro.codigo === 'RECURSO_DESATIVADO') {
      return {
        tom: 'info',
        texto:
          'Busca automática de endereço indisponível no momento. Você pode preencher o endereço manualmente.',
      };
    }
    if (erro.status === 429) {
      return {
        tom: 'alerta',
        texto:
          'Muitas consultas em sequência. Aguarde alguns segundos ou continue informando o endereço manualmente.',
      };
    }
    if (erro.status === 503 || erro.status === 0) {
      return {
        tom: 'alerta',
        texto:
          'Serviço de busca temporariamente indisponível. Continue informando o endereço manualmente.',
      };
    }
    return { tom: 'alerta', texto: erro.mensagemCompleta };
  }
  return {
    tom: 'alerta',
    texto: 'Não foi possível consultar o endereço agora. Continue informando manualmente.',
  };
}

function mensagemErroGps(codigo: number): string {
  if (codigo === 1) {
    return 'Permissão de localização negada. Ative o GPS no navegador ou digite o endereço manualmente.';
  }
  if (codigo === 2) {
    return 'Não foi possível determinar sua localização agora. Tente novamente ou informe o endereço manualmente.';
  }
  if (codigo === 3) {
    return 'A obtenção do GPS excedeu o tempo limite. Tente novamente ou informe o endereço manualmente.';
  }
  return 'Não foi possível obter sua localização. Informe o endereço manualmente.';
}

export function SeletorLocalMapa({
  id,
  chaveRegistro,
  label = 'Endereço / Localização',
  placeholder,
  valor,
  coordenadas = null,
  onChange,
  onSelecaoConfirmada,
  operacao = 'ADM',
  modoPublico = false,
  exibicaoMapa = 'expansivel',
  exibirAtalhosUnidades,
  exibirBotaoGps = true,
  alturaMapa = '260px',
  desabilitado = false,
  obrigatorio = false,
  erro,
  dica,
  className,
}: SeletorLocalMapaProps) {
  const autoId = useId();
  const inputId = id ?? `seletor-local-${autoId}`;
  const listaId = `${inputId}-sugestoes`;
  const mapasAtivos = modoPublico
    ? recursoAtivo('portalSvo') && recursoAtivo('mapasSvo')
    : recursoAtivo(operacao === 'SVO' ? 'mapasSvo' : 'mapasInternos');
  const mostrarAtalhos = mapasAtivos && !modoPublico && (exibirAtalhosUnidades ?? true);
  const placeholderEfetivo =
    placeholder ??
    (modoPublico
      ? 'Digite o CEP (ex.: 49015-110) ou informe o endereço manualmente'
      : 'Digite um endereço ou CEP (ex.: Av. Tancredo Neves ou 49015-110)');

  const [mapaIndisponivel, setMapaIndisponivel] = useState(false);
  const [mapaExpandido, setMapaExpandido] = useState(exibicaoMapa === 'aberto');
  const [buscando, setBuscando] = useState(false);
  const [buscandoUnidade, setBuscandoUnidade] = useState<UnidadeInstitucional | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [buscandoReverso, setBuscandoReverso] = useState(false);
  const [sugestoes, setSugestoes] = useState<EnderecoMapa[]>([]);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const [aviso, setAviso] = useState<AvisoStatus | null>(null);
  const [foraDeSergipe, setForaDeSergipe] = useState<boolean>(
    coordenadas ? coordenadaForaDeSergipe(coordenadas) : false,
  );
  const [confirmouForaDeSergipe, setConfirmouForaDeSergipe] = useState(false);
  const [centroControlado, setCentroControlado] = useState<Partial<VisaoInicialMapa> | null>(
    coordenadas
      ? { latitude: coordenadas.latitude, longitude: coordenadas.longitude, zoom: ZOOM_SELECAO }
      : null,
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const intencaoRef = useRef(0);
  const ultimaEmissao = useRef<{ valor: string; coordenadas: CoordenadaMapa | null } | null>(null);
  const latitude = coordenadas?.latitude;
  const longitude = coordenadas?.longitude;

  const invalidarIntencao = useCallback(() => {
    intencaoRef.current += 1;
    window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const iniciarIntencao = useCallback(() => {
    invalidarIntencao();
    setBuscando(false);
    setBuscandoUnidade(null);
    setBuscandoGps(false);
    setBuscandoReverso(false);
    setSugestoes([]);
    setDropdownAberto(false);
    setIndiceAtivo(-1);
    setAviso(null);
    return intencaoRef.current;
  }, [invalidarIntencao]);

  const publicarMudanca = useCallback((texto: string, coords: CoordenadaMapa | null) => {
    ultimaEmissao.current = { valor: texto, coordenadas: coords };
    onChange(texto, coords);
  }, [onChange]);

  useEffect(() => {
    if (exibicaoMapa === 'aberto') setMapaExpandido(true);
  }, [exibicaoMapa]);

  useLayoutEffect(() => {
    const emissao = ultimaEmissao.current;
    ultimaEmissao.current = null;
    if (emissao?.valor === valor && emissao.coordenadas?.latitude === latitude &&
        emissao.coordenadas?.longitude === longitude) return;
    iniciarIntencao();
    const ponto = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
    setCentroControlado(ponto ? { ...ponto, zoom: ZOOM_SELECAO } : null);
    setForaDeSergipe(ponto ? coordenadaForaDeSergipe(ponto) : false);
    setConfirmouForaDeSergipe(false);
  }, [valor, latitude, longitude, chaveRegistro, iniciarIntencao]);

  useLayoutEffect(() => {
    iniciarIntencao();
    return invalidarIntencao;
  }, [desabilitado, mapasAtivos, modoPublico, operacao, iniciarIntencao, invalidarIntencao]);

  useEffect(() => {
    const aoClicarFora = (evento: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(evento.target as Node)) {
        setDropdownAberto(false);
        setIndiceAtivo(-1);
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  const confirmarSelecao = useCallback(
    (endereco: EnderecoMapa, origem: OrigemLocalSelecionado) => {
      const textoFormatado = formatarEnderecoMapa(endereco) || (endereco.coordenadas ? [endereco.coordenadas.latitude, endereco.coordenadas.longitude].join(', ') : '');
      const coords = endereco.coordenadas
        ? {
            latitude: arredondarCoordenada(endereco.coordenadas.latitude),
            longitude: arredondarCoordenada(endereco.coordenadas.longitude),
          }
        : null;
      const fora = determinarForaDeSergipe({ ...endereco, coordenadas: coords });

      setDropdownAberto(false);
      setSugestoes([]);
      setIndiceAtivo(-1);
      setForaDeSergipe(fora === true);
      setConfirmouForaDeSergipe(false);

      setCentroControlado(coords ? { ...coords, zoom: ZOOM_SELECAO } : null);

      publicarMudanca(textoFormatado, coords);
      onSelecaoConfirmada?.({
        endereco: textoFormatado,
        coordenadas: coords,
        detalhes: {
          fonte: endereco.fonte,
          logradouro: endereco.logradouro,
          numero: endereco.numero,
          bairro: endereco.bairro,
          municipio: endereco.municipio,
          estado: endereco.estado,
          cep: endereco.cep,
          foraDeSergipe: fora,
        },
        foraDeSergipe: fora,
        origem,
      });
    },
    [publicarMudanca, onSelecaoConfirmada],
  );

  const executarBusca = useCallback(
    async (entrada: string, sequencia: number) => {
      if (sequencia !== intencaoRef.current) return;
      const cep = extrairCepValido(entrada);
      if (!cep && (modoPublico || !consultaTextoValidaParaBusca(entrada))) {
        setSugestoes([]);
        setDropdownAberto(false);
        setBuscando(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setBuscando(true);
      setAviso(null);

      try {
        const resposta = await mapasApi.buscar({
          ...(cep ? { cep } : { q: entrada }),
          operacao,
          modoPublico,
          signal: controller.signal,
        });

        if (sequencia !== intencaoRef.current) return;

        setSugestoes(resposta.resultados);
        setDropdownAberto(resposta.resultados.length > 0);
        setIndiceAtivo(resposta.resultados.length > 0 ? 0 : -1);

        if (resposta.degradado && resposta.resultados.length > 0) {
          setAviso({
            tom: 'info',
            texto:
              'Endereço encontrado pelo CEP sem coordenadas automáticas. Selecione-o para preencher e ajuste o ponto no mapa se desejar.',
          });
        } else if (resposta.resultados.length === 0) {
          setAviso({
            tom: 'info',
            texto: cep
              ? 'CEP não localizado. Você pode informar o endereço manualmente ou marcar o ponto no mapa.'
              : 'Nenhum endereço encontrado. Continue digitando manualmente ou marque o ponto no mapa.',
          });
        }
      } catch (erroCapturado) {
        if (sequencia !== intencaoRef.current) return;
        const avisoErro = mensagemErroBusca(erroCapturado);
        if (avisoErro) setAviso(avisoErro);
        setSugestoes([]);
        setDropdownAberto(false);
      } finally {
        if (sequencia === intencaoRef.current) {
          setBuscando(false);
        }
      }
    },
    [modoPublico, operacao],
  );

  const handleTextoChange = (textoBruto: string) => {
    const sequencia = iniciarIntencao();
    const novoTexto = aplicarMascaraCepSeAplicavel(textoBruto);
    setCentroControlado(null);
    setForaDeSergipe(false);
    setConfirmouForaDeSergipe(false);
    publicarMudanca(novoTexto, null);

    if (!mapasAtivos || desabilitado) return;
    const cep = extrairCepValido(novoTexto);
    if (!cep && (modoPublico || !consultaTextoValidaParaBusca(novoTexto))) return;
    debounceRef.current = window.setTimeout(() => {
      void executarBusca(novoTexto, sequencia);
    }, DEBOUNCE_BUSCA_MS);
  };

  const handleKeyDown = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownAberto || sugestoes.length === 0) {
      if (evento.key === 'Escape') {
        setDropdownAberto(false);
      }
      return;
    }

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual + 1) % sugestoes.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual <= 0 ? sugestoes.length - 1 : atual - 1));
    } else if (evento.key === 'Enter' && indiceAtivo >= 0) {
      evento.preventDefault();
      const escolhido = sugestoes[indiceAtivo];
      if (escolhido && !desabilitado) {
        iniciarIntencao();
        confirmarSelecao(escolhido, extrairCepValido(valor) ? 'cep' : 'busca');
      }
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      setDropdownAberto(false);
      setIndiceAtivo(-1);
    }
  };

  const consultarPontoNoMapa = useCallback(
    async (pontoBruto: CoordenadaMapa, origem: 'mapa' | 'gps') => {
      if (desabilitado || !mapasAtivos) return;
      const sequencia = iniciarIntencao();
      const ponto: CoordenadaMapa = {
        latitude: arredondarCoordenada(pontoBruto.latitude),
        longitude: arredondarCoordenada(pontoBruto.longitude),
      };

      const controller = new AbortController();
      abortRef.current = controller;

      setCentroControlado({
        latitude: ponto.latitude,
        longitude: ponto.longitude,
        zoom: ZOOM_SELECAO,
      });
      setBuscandoReverso(true);
      setAviso(null);

      try {
        const resposta = await mapasApi.reverso({
          lat: ponto.latitude,
          lon: ponto.longitude,
          operacao,
          modoPublico,
          signal: controller.signal,
        });

        if (sequencia !== intencaoRef.current) return;

        const primeiro = resposta.resultados[0];
        if (primeiro) {
          confirmarSelecao({ ...primeiro, coordenadas: ponto }, origem);
          return;
        }

        const fora = coordenadaForaDeSergipe(ponto);
        const textoMantido =
          [ponto.latitude, ponto.longitude].join(', ');
        setForaDeSergipe(fora);
        setConfirmouForaDeSergipe(false);
        publicarMudanca(textoMantido, ponto);
        onSelecaoConfirmada?.({
          endereco: textoMantido,
          coordenadas: ponto,
          foraDeSergipe: fora,
          origem,
        });
        setAviso({
          tom: 'info',
          texto: 'Ponto marcado no mapa. Complete ou ajuste o endereço manualmente se necessário.',
        });
      } catch (erroCapturado) {
        if (sequencia !== intencaoRef.current) return;
        const avisoErro = mensagemErroBusca(erroCapturado);
        if (!avisoErro) return;

        const fora = coordenadaForaDeSergipe(ponto);
        const textoMantido =
          [ponto.latitude, ponto.longitude].join(', ');
        setForaDeSergipe(fora);
        setConfirmouForaDeSergipe(false);
        publicarMudanca(textoMantido, ponto);
        onSelecaoConfirmada?.({
          endereco: textoMantido,
          coordenadas: ponto,
          foraDeSergipe: fora,
          origem,
        });
        setAviso({
          tom: 'info',
          texto:
            'Ponto marcado no mapa, mas não foi possível traduzir o endereço automaticamente. Informe o endereço manualmente.',
        });
      } finally {
        if (sequencia === intencaoRef.current) {
          setBuscandoReverso(false);
        }
      }
    },
    [confirmarSelecao, desabilitado, iniciarIntencao, mapasAtivos, modoPublico, onSelecaoConfirmada, operacao, publicarMudanca],
  );

  const handleSelecionarUnidade = async (unidade: UnidadeInstitucional) => {
    if (desabilitado || !mostrarAtalhos) return;
    const sequencia = iniciarIntencao();
    const definicao = UNIDADES_INSTITUCIONAIS.find((item) => item.codigo === unidade);
    const controller = new AbortController();
    abortRef.current = controller;

    setBuscandoUnidade(unidade);
    setAviso(null);
    setDropdownAberto(false);

    try {
      const resposta = await mapasApi.buscar({
        unidade,
        operacao,
        signal: controller.signal,
      });

      if (sequencia !== intencaoRef.current) return;

      const encontrado = resposta.resultados[0];
      if (encontrado) {
        confirmarSelecao(encontrado, 'unidade');
      } else {
        const textoUnidade = definicao?.nomeCompleto ?? unidade;
        setForaDeSergipe(false);
        setConfirmouForaDeSergipe(false);
        publicarMudanca(textoUnidade, null);
        setAviso({
          tom: 'info',
          texto: `Coordenadas oficiais de ${unidade} ainda não cadastradas. Nome preenchido em modo manual; você pode ajustar o ponto no mapa.`,
        });
      }
    } catch (erroCapturado) {
      if (sequencia !== intencaoRef.current) return;
      if (erroCapturado instanceof ApiError && erroCapturado.codigo === CODIGO_CANCELADO) return;
      const textoUnidade = definicao?.nomeCompleto ?? unidade;
      setForaDeSergipe(false);
      setConfirmouForaDeSergipe(false);
      publicarMudanca(textoUnidade, null);
      setAviso({
        tom: 'info',
        texto: `Não foi possível consultar as coordenadas de ${unidade}. Nome preenchido em modo manual.`,
      });
    } finally {
      if (sequencia === intencaoRef.current) {
        setBuscandoUnidade(null);
      }
    }
  };

  const handleUsarGps = () => {
    if (desabilitado || !mapasAtivos || buscandoGps) return;
    const sequencia = iniciarIntencao();
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setAviso({
        tom: 'alerta',
        texto: 'Geolocalização não suportada neste navegador. Informe o endereço manualmente.',
      });
      return;
    }

    setBuscandoGps(true);
    setAviso(null);

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        if (sequencia !== intencaoRef.current) return;
        setBuscandoGps(false);
        const ponto: CoordenadaMapa = {
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
        };
        void consultarPontoNoMapa(ponto, 'gps');
      },
      (erroGeo) => {
        if (sequencia !== intencaoRef.current) return;
        setBuscandoGps(false);
        setAviso({ tom: 'alerta', texto: mensagemErroGps(erroGeo.code) });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const handleLimparCoordenadas = () => {
    if (desabilitado) return;
    iniciarIntencao();
    setCentroControlado(null);
    setForaDeSergipe(false);
    setConfirmouForaDeSergipe(false);
    publicarMudanca(valor, null);
  };

  const ativoDescendantId =
    dropdownAberto && indiceAtivo >= 0 ? `${listaId}-opcao-${indiceAtivo}` : undefined;

  return (
    <div ref={containerRef} className={cn('mb-4 flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="font-display text-sm font-semibold text-text-secondary">
          {label}
          {obrigatorio && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>

        {coordenadas && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
            data-testid="seletor-local-badge-coordenadas"
          >
            <MapPin size={12} aria-hidden="true" />
            Ponto definido
          </span>
        )}
      </div>

      {/* Campo de busca único (CEP ou endereço) + ações */}
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={dropdownAberto}
            aria-controls={dropdownAberto && sugestoes.length > 0 ? listaId : undefined}
            aria-describedby={erro ? inputId + '-erro' : dica ? inputId + '-dica' : undefined}
            aria-activedescendant={ativoDescendantId}
            aria-invalid={erro ? true : undefined}
            aria-required={obrigatorio || undefined}
            value={valor}
            onChange={(evento) => handleTextoChange(evento.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (sugestoes.length > 0) setDropdownAberto(true);
            }}
            placeholder={placeholderEfetivo}
            disabled={desabilitado}
            autoComplete="off"
            className={cn(
              'min-h-[42px] w-full rounded-md border-[1.5px] border-border bg-surface py-2.5 pr-9 pl-9 font-sans text-sm text-text-secondary transition-colors duration-150 outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70 md:min-h-0',
              erro && 'border-danger focus:border-danger',
            )}
          />
          {(buscando || buscandoReverso) && (
            <Loader2
              size={16}
              className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-primary"
              aria-label="Consultando endereço"
            />
          )}

          {/* Lista de sugestões acessível */}
          {dropdownAberto && sugestoes.length > 0 && (
            <ul
              id={listaId}
              role="listbox"
              aria-label="Sugestões de endereço"
              className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
            >
              {sugestoes.map((item, indice) => {
                const textoOpcao = formatarEnderecoMapa(item);
                const selecionado = indice === indiceAtivo;
                const fora = determinarForaDeSergipe(item);
                return (
                  <li
                    key={`${item.fonte}-${textoOpcao}-${indice}`}
                    id={`${listaId}-opcao-${indice}`}
                    role="option"
                    aria-selected={selecionado}
                    onMouseDown={(evento) => evento.preventDefault()}
                    onClick={() => {
                      if (desabilitado) return;
                      iniciarIntencao();
                      confirmarSelecao(item, extrairCepValido(valor) ? 'cep' : 'busca');
                    }}
                    onMouseEnter={() => setIndiceAtivo(indice)}
                    className={cn(
                      'flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                      selecionado
                        ? 'bg-primary-soft text-primary'
                        : 'text-text-secondary hover:bg-surface-alt',
                    )}
                  >
                    <span className="leading-snug font-medium">{textoOpcao}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        {item.fonte === 'viaCEP'
                          ? 'ViaCEP'
                          : item.fonte === 'unidade'
                            ? 'Unidade FSPH'
                            : 'Mapa'}
                      </span>
                      {!item.coordenadas && <span>· sem coordenadas automáticas</span>}
                      {fora === true && (
                        <span className="font-medium text-amber-700">· fora de Sergipe</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mapasAtivos && exibirBotaoGps && (
            <button
              type="button"
              onClick={handleUsarGps}
              disabled={desabilitado || buscandoGps}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-2 text-xs font-semibold text-text-strong transition-colors hover:border-primary/50 hover:bg-primary-soft/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none md:min-h-0"
            >
              {buscandoGps ? (
                <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Crosshair size={14} aria-hidden="true" />
              )}
              <span>Usar minha localização</span>
            </button>
          )}

          {mapasAtivos && exibicaoMapa === 'expansivel' && (
            <button
              type="button"
              onClick={() => {
                setMapaIndisponivel(false);
                setMapaExpandido((aberto) => !aberto);
              }}
              disabled={desabilitado}
              aria-expanded={mapaExpandido}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-2 text-xs font-semibold text-text-strong transition-colors hover:border-primary/50 hover:bg-primary-soft/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none md:min-h-0"
            >
              <MapIcon size={14} aria-hidden="true" />
              <span>{mapaExpandido ? 'Ocultar mapa' : 'Abrir mapa'}</span>
              {mapaExpandido ? (
                <ChevronUp size={14} aria-hidden="true" />
              ) : (
                <ChevronDown size={14} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Chips de atalho institucional (HEMOSE / SVO / LACEN) */}
      {mostrarAtalhos && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Atalhos de unidades institucionais"
        >
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
            <Building2 size={12} aria-hidden="true" />
            Atalhos:
          </span>
          {UNIDADES_INSTITUCIONAIS.map((unidade) => {
            const carregandoEste = buscandoUnidade === unidade.codigo;
            return (
              <button
                key={unidade.codigo}
                type="button"
                disabled={desabilitado || carregandoEste}
                onClick={() => void handleSelecionarUnidade(unidade.codigo)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-alt px-2.5 py-1 text-xs font-semibold text-text-secondary transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregandoEste && (
                  <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" />
                )}
                {unidade.rotulo}
              </button>
            );
          })}
        </div>
      )}

      {/* Aviso de fora de Sergipe (nunca bloqueia o formulário) */}
      {foraDeSergipe && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              Este endereço aparenta estar <strong>fora de Sergipe</strong>. Verifique se o ponto no
              mapa está correto antes de prosseguir.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-amber-950">
            <input
              type="checkbox"
              disabled={desabilitado}
              checked={confirmouForaDeSergipe}
              onChange={(evento) => setConfirmouForaDeSergipe(evento.target.checked)}
              className="h-4 w-4 rounded border-amber-400 text-amber-700 focus:ring-amber-500"
            />
            <span>Confirmo que o local realmente fica fora de Sergipe</span>
          </label>
        </div>
      )}

      {/* Avisos de status (fallback, degradado, GPS, 429, unidade sem coordenadas) */}
      <p className="sr-only" aria-live="polite">
        {buscando || buscandoUnidade || buscandoGps || buscandoReverso ? 'Consultando localização…' : ''}
      </p>
      {aviso && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'rounded-md px-3 py-2 text-xs leading-relaxed',
            aviso.tom === 'alerta'
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : 'border border-slate-200 bg-slate-50 text-slate-700',
          )}
        >
          {aviso.texto}
        </p>
      )}

      {dica && !erro && <p id={inputId + '-dica'} className="text-xs text-slate-500">{dica}</p>}
      {erro && (
        <p id={inputId + '-erro'} role="alert" className="text-xs font-medium text-danger">
          {erro}
        </p>
      )}

      {/* Mapa interativo */}
      {mapasAtivos && mapaExpandido && (
        <div className="flex flex-col gap-1.5">
          <MapaBase
            onIndisponivel={() => setMapaIndisponivel(true)}
            altura={alturaMapa}
            centroInicial={
              coordenadas
                ? {
                    latitude: coordenadas.latitude,
                    longitude: coordenadas.longitude,
                    zoom: ZOOM_SELECAO,
                  }
                : CENTRO_PADRAO_SERGIPE
            }
            centroControlado={centroControlado}
            marcadorPadrao={
              coordenadas
                ? {
                    latitude: coordenadas.latitude,
                    longitude: coordenadas.longitude,
                    titulo: valor || 'Local selecionado',
                  }
                : null
            }
            marcadorArrastavel={!desabilitado}
            onClickMapa={
              desabilitado
                ? undefined
                : (ponto) => {
                    void consultarPontoNoMapa(ponto, 'mapa');
                  }
            }
            onDragEndMarcador={
              desabilitado
                ? undefined
                : (ponto) => {
                    void consultarPontoNoMapa(ponto, 'mapa');
                  }
            }
            tituloAcessivel={`Mapa para seleção de ${label}`}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              {mapaIndisponivel ? 'Informe o endereço no campo de texto.' : coordenadas
                ? `Coordenadas: ${arredondarCoordenada(coordenadas.latitude)}, ${arredondarCoordenada(coordenadas.longitude)} — clique no mapa ou arraste o pin para ajustar.`
                : 'Clique em qualquer ponto do mapa para marcar as coordenadas manualmente.'}
            </span>

            {coordenadas && !desabilitado && (
              <button
                type="button"
                onClick={handleLimparCoordenadas}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-700 underline-offset-2 hover:bg-slate-100 hover:underline"
              >
                <X size={12} aria-hidden="true" />
                Limpar ponto no mapa
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
