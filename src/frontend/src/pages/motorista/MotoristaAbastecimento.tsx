import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Fuel, History } from 'lucide-react';
import { Alert, Button, Card, EmptyState, Input, Modal, PlacaMercosul } from '../../components/ui';
import { abastecimentosApi } from '../../services/api/abastecimentosApi';
import { mensagemDeErro } from '../../services/api/http';
import { motoristasApi } from '../../services/api/motoristasApi';
import { veiculosApi } from '../../services/api/veiculosApi';
import type { Abastecimento } from '../../types/abastecimento';
import type { Veiculo } from '../../types/veiculo';
import { cn } from '../../utils/cn';
import { usePermissao } from '../../utils/permissoes';
import { CLASSES_ACOES_FOLHA } from '../viagens/acoesFolha';
import { AvisoFlutuante, BOTAO_PRINCIPAL, Carregando, ErroDeCarga } from './comuns';
import { dataCurta, emLitros, hojeLocal, reais, resumoAbastecimento } from './formatarQuando';
import { useAviso } from './useAviso';

const MAXIMO_HISTORICO = 5;
const CAMPO =
  'min-h-13 text-lg font-semibold md:min-h-13 [@media(min-height:800px)]:min-h-15';

/** Aceita "45,5" e "45.5"; qualquer outra coisa é inválida (não lê só o começo do texto). */
function lerDecimal(texto: string): number {
  const limpo = texto.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : NaN;
}

/** Abastecer, no celular do motorista: veículo e data já preenchidos e teclado numérico. */
export default function MotoristaAbastecimento() {
  const location = useLocation();
  const { podeNaFrota } = usePermissao();
  const { aviso, avisar, fecharAviso } = useAviso();
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristaId, setMotoristaId] = useState<number | null>(null);
  const [historico, setHistorico] = useState<Abastecimento[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [veiculoId, setVeiculoId] = useState<number | null>(null);
  const [km, setKm] = useState('');
  const [litros, setLitros] = useState('');
  const [valorLitro, setValorLitro] = useState('');
  const [posto, setPosto] = useState('');
  const [data, setData] = useState(() => hojeLocal());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const envioEmCurso = useRef(false);

  const veiculoInicial: number | undefined = location.state?.veiculoId;

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const [frota, perfil] = await Promise.all([veiculosApi.listar(), motoristasApi.buscarMeuPerfil()]);
      // A API já devolve só os veículos das viagens ativas do motorista
      const permitidos = frota.filter((v) => podeNaFrota('abastecimentos.registrar', v.tipo_frota));
      setVeiculos(permitidos);
      setMotoristaId(perfil.id);
      setVeiculoId((atual) => {
        const preferido =
          permitidos.find((v) => v.id === (atual ?? veiculoInicial)) ??
          permitidos.find((v) => v.status === 'EM_USO') ??
          permitidos[0];
        return preferido?.id ?? null;
      });
    } catch (e) {
      setErroCarga(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
    // `podeNaFrota` é recriada a cada render, mas só depende do perfil logado
  }, [veiculoInicial]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarHistorico = useCallback(async () => {
    if (veiculoId === null) return [];
    return abastecimentosApi.listarTodos([veiculoId]);
  }, [veiculoId]);

  useEffect(() => {
    let ativo = true;
    setHistorico([]);
    carregarHistorico().then(
      (lista) => { if (ativo) setHistorico(lista); },
      () => undefined,
    );
    return () => { ativo = false; };
  }, [carregarHistorico]);

  const veiculo = veiculos.find((v) => v.id === veiculoId);
  const total = Number((lerDecimal(litros) * lerDecimal(valorLitro)).toFixed(2));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (envioEmCurso.current) return;
    if (!veiculo || motoristaId === null) return setErro('Selecione o veículo.');
    if (!/^\d+$/.test(km.trim())) return setErro('Informe o km do painel, só com números.');
    if (!(lerDecimal(litros) > 0)) return setErro('Informe os litros. Ex.: 45,5');
    if (!(lerDecimal(valorLitro) > 0)) return setErro('Informe o valor por litro. Ex.: 6,19');
    if (!posto.trim()) return setErro('Informe o posto.');
    if (!data) return setErro('Informe a data.');

    setErro('');
    envioEmCurso.current = true;
    setSalvando(true);
    try {
      await abastecimentosApi.criar({
        veiculo_id: veiculo.id,
        motorista_id: motoristaId,
        data_abastecimento: data,
        quilometragem: Number(km),
        litros: lerDecimal(litros),
        valor_total: total,
        posto_combustivel: posto.trim(),
      });
      setKm('');
      setLitros('');
      setValorLitro('');
      setPosto('');
      setData(hojeLocal());
      avisar('Abastecimento registrado.');
      setHistorico(await carregarHistorico());
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      envioEmCurso.current = false;
      setSalvando(false);
    }
  };

  if (carregando) return <Carregando texto="Carregando..." />;
  if (erroCarga) return <ErroDeCarga mensagem={erroCarga} onTentar={() => void carregar()} />;
  if (veiculos.length === 0) {
    return (
      <EmptyState
        icon={<Fuel size={24} />}
        title="Sem veículo para abastecer"
        description="O abastecimento é liberado quando você tem uma viagem agendada ou em andamento."
        className="my-auto bg-surface py-12"
      />
    );
  }

  return (
    <div className="my-auto flex flex-col gap-3">
      {historico.length > 0 && (
        <Card className="hidden items-center gap-3 px-4 py-3 [@media(min-height:860px)]:flex">
          <Fuel size={20} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm text-neutral">Último abastecimento</span>
            <span className="block truncate font-display text-[15px] font-semibold text-text">
              {resumoAbastecimento(historico[0])}
            </span>
          </span>
        </Card>
      )}
      <Card className="p-4">
        <form noValidate onSubmit={salvar} className="[&_.mb-4]:mb-3 [@media(min-height:800px)]:[&_.mb-4]:mb-4">
          {veiculos.length > 1 ? (
            <fieldset className="m-0 mb-3 border-0 p-0">
              <legend className="mb-1.5 p-0 font-display text-sm font-semibold">Veículo</legend>
              <div className="flex flex-col gap-2">
                {veiculos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={v.id === veiculoId}
                    disabled={salvando}
                    onClick={() => setVeiculoId(v.id)}
                    className={cn(
                      'flex min-h-13 items-center gap-3 rounded-lg border-[1.5px] px-3 text-left',
                      v.id === veiculoId ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
                    )}
                  >
                    <PlacaMercosul placa={v.placa} size="sm" />
                    <span className="truncate text-[15px] font-semibold text-text">{v.modelo}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="mb-3 flex items-center gap-3">
              <PlacaMercosul placa={veiculos[0].placa} size="sm" />
              <strong className="truncate text-[15px] text-text">{veiculos[0].modelo}</strong>
            </div>
          )}

          <Input
            label="Km do painel"
            inputMode="numeric"
            enterKeyHint="next"
            autoComplete="off"
            className={CAMPO}
            placeholder={veiculo?.km_atual ? `Último km: ${veiculo.km_atual}` : undefined}
            value={km}
            readOnly={salvando}
            onChange={(e) => setKm(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Litros"
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              className={CAMPO}
              placeholder="45,5"
              value={litros}
              readOnly={salvando}
              onChange={(e) => setLitros(e.target.value)}
            />
            <Input
              label="R$ por litro"
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              className={CAMPO}
              placeholder="6,19"
              value={valorLitro}
              readOnly={salvando}
              onChange={(e) => setValorLitro(e.target.value)}
            />
          </div>
          <Input
            label="Posto"
            enterKeyHint="done"
            maxLength={150}
            className={cn(CAMPO, 'text-base font-medium')}
            placeholder="Nome do posto"
            value={posto}
            readOnly={salvando}
            onChange={(e) => setPosto(e.target.value)}
          />
          <div className="grid grid-cols-2 items-end gap-3">
            <Input
              label="Data"
              type="date"
              max={hojeLocal()}
              className={cn(CAMPO, 'text-base font-medium')}
              value={data}
              readOnly={salvando}
              onChange={(e) => setData(e.target.value)}
            />
            <div className="mb-3 flex min-h-13 flex-col justify-center text-right">
              <span className="text-sm text-neutral">Total</span>
              <strong className="text-xl leading-tight text-text">{total > 0 ? reais(total) : '—'}</strong>
            </div>
          </div>

          {erro && (
            <Alert tone="danger" className="mb-3">
              {erro}
            </Alert>
          )}
          {historico.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="mb-1 min-h-12 w-full"
              onClick={() => setHistoricoAberto(true)}
            >
              <History size={18} aria-hidden="true" /> Últimos abastecimentos
            </Button>
          )}
          {/* Sempre visível, mesmo quando o formulário não cabe inteiro na tela */}
          <div className="sticky -bottom-3 -mx-4 -mb-4 rounded-b-xl bg-surface px-4 pt-1 pb-4">
            <Button type="submit" className={BOTAO_PRINCIPAL} disabled={salvando}>
              <Fuel size={19} aria-hidden="true" /> {salvando ? 'Salvando...' : 'Salvar abastecimento'}
            </Button>
          </div>
        </form>
      </Card>

      {historicoAberto && (
        <Modal
          title="Últimos abastecimentos deste veículo"
          onClose={() => setHistoricoAberto(false)}
          telaInteira
          gerenciarFoco
          ajustarAoTeclado
          folhaInferior
        >
          <ul className="m-0 list-none divide-y divide-divider p-0">
            {historico.slice(0, MAXIMO_HISTORICO).map((a) => (
              <li key={a.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-text">
                    {a.posto_combustivel ?? 'Posto não informado'}
                  </span>
                  <span className="block text-sm text-neutral">
                    {dataCurta(a.data_abastecimento)} ·{' '}
                    {emLitros(a.litros)}
                  </span>
                </span>
                <strong className="shrink-0 text-[15px] text-text">{reais(Number(a.valor_total))}</strong>
              </li>
            ))}
          </ul>
          <div className={CLASSES_ACOES_FOLHA}>
            <Button type="button" variant="outline" onClick={() => setHistoricoAberto(false)}>
              Voltar
            </Button>
          </div>
        </Modal>
      )}

      <AvisoFlutuante aviso={aviso} onFechar={fecharAviso} />
    </div>
  );
}
