import { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, mensagemDeErro } from '../../services/api/http';
import {
  relatoriosApi,
  type FormatoExportacao,
  type TipoRelatorio,
} from '../../services/api/relatoriosApi';
import { PERFIS } from '../../types/usuario';
import { cn } from '../../utils/cn';
import { usePermissao } from '../../utils/permissoes';
import { Alert, Button, Input, Modal, ModalFooter } from '../ui';

interface BotaoExportarRelatorioProps {
  tipo: TipoRelatorio;
}

type EstadoDownload = 'ocioso' | 'exportando' | 'sucesso' | 'erro';

const TITULOS_RELATORIO: Record<TipoRelatorio, string> = {
  viagens: 'Viagens',
  abastecimentos: 'Abastecimentos',
  manutencoes: 'Manutenções',
  multas: 'Multas e Infrações',
};

const OPCOES_FORMATO: {
  valor: FormatoExportacao;
  titulo: string;
  detalhe: string;
  icone: 'planilha' | 'pdf';
}[] = [
  {
    valor: 'xlsx',
    titulo: 'Excel (.xlsx)',
    detalhe: 'Até 50.000 linhas · filtros e colunas tipadas',
    icone: 'planilha',
  },
  {
    valor: 'csv',
    titulo: 'CSV (.csv)',
    detalhe: 'Até 50.000 linhas · UTF-8 separado por ";"',
    icone: 'planilha',
  },
  {
    valor: 'pdf',
    titulo: 'PDF (.pdf)',
    detalhe: 'Até 5.000 linhas · A4 paisagem para impressão',
    icone: 'pdf',
  },
];

function formatarIsoLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function obterInicioMesAtual(): string {
  const hoje = new Date();
  return formatarIsoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
}

function obterUltimos30Dias(): string {
  const data = new Date();
  data.setDate(data.getDate() - 30);
  return formatarIsoLocal(data);
}

export function BotaoExportarRelatorio({ tipo }: BotaoExportarRelatorioProps) {
  const { pode } = usePermissao();
  const { usuario } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [formato, setFormato] = useState<FormatoExportacao>('xlsx');
  const [inicio, setInicio] = useState<string>(() => obterInicioMesAtual());
  const [fim, setFim] = useState<string>(() => formatarIsoLocal(new Date()));
  const [estado, setEstado] = useState<EstadoDownload>('ocioso');
  const [erro, setErro] = useState<string | null>(null);
  const [erroLimitePdf, setErroLimitePdf] = useState(false);
  const [arquivoBaixado, setArquivoBaixado] = useState<string | null>(null);

  if (!pode('relatorios.exportar')) {
    return null;
  }

  const exportando = estado === 'exportando';

  const limparMensagens = () => {
    setErro(null);
    setErroLimitePdf(false);
    setArquivoBaixado(null);
    if (estado !== 'ocioso') {
      setEstado('ocioso');
    }
  };

  const abrirModal = () => {
    setEstado('ocioso');
    setErro(null);
    setErroLimitePdf(false);
    setArquivoBaixado(null);
    setFormato('xlsx');
    setInicio(obterInicioMesAtual());
    setFim(formatarIsoLocal(new Date()));
    setAberto(true);
  };

  const aplicarAtalho = (novoInicio: string, novoFim: string) => {
    if (exportando) return;
    limparMensagens();
    setInicio(novoInicio);
    setFim(novoFim);
  };

  const handleExportar = async () => {
    if (inicio && fim && inicio > fim) {
      setEstado('erro');
      setErro('A data inicial deve ser anterior ou igual à data final.');
      setErroLimitePdf(false);
      return;
    }

    setErro(null);
    setErroLimitePdf(false);
    setArquivoBaixado(null);
    setEstado('exportando');
    try {
      const nomeArquivo = await relatoriosApi.exportar(tipo, formato, {
        inicio: inicio || undefined,
        fim: fim || undefined,
      });
      setEstado('sucesso');
      setArquivoBaixado(nomeArquivo);
    } catch (err) {
      setEstado('erro');
      setErro(mensagemDeErro(err));
      setErroLimitePdf(
        err instanceof ApiError && err.status === 422 && formato === 'pdf',
      );
    }
  };

  const hojeIso = formatarIsoLocal(new Date());
  const inicioMesAtual = obterInicioMesAtual();
  const ultimos30Dias = obterUltimos30Dias();

  const atalhoAtivo =
    !inicio && !fim
      ? 'tudo'
      : inicio === inicioMesAtual && fim === hojeIso
        ? 'mes'
        : inicio === ultimos30Dias && fim === hojeIso
          ? '30dias'
          : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={abrirModal}
        title={`Baixar relatório de ${TITULOS_RELATORIO[tipo]}`}
      >
        <Download size={13} /> Baixar relatório
      </Button>

      {aberto && (
        <Modal
          title={`Exportar Relatório · ${TITULOS_RELATORIO[tipo]}`}
          onClose={() => !exportando && setAberto(false)}
          hideFooter
          maxWidth={540}
        >
          <div className="flex flex-col gap-4">
            {estado === 'erro' && erro && (
              <Alert tone="danger">
                <div className="flex flex-col gap-2">
                  <span>{erro}</span>
                  {erroLimitePdf && (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormato('xlsx');
                          limparMensagens();
                        }}
                      >
                        Mudar para Excel (.xlsx)
                      </Button>
                    </div>
                  )}
                </div>
              </Alert>
            )}

            {estado === 'sucesso' && arquivoBaixado && (
              <Alert tone="success">
                <div className="flex flex-col gap-1">
                  <span>
                    Download concluído: <strong className="font-semibold">{arquivoBaixado}</strong>
                  </span>
                  <span className="text-xs opacity-90">
                    Caso não haja registros no período selecionado, o arquivo será gerado apenas com
                    o cabeçalho (ou aviso no PDF).
                  </span>
                </div>
              </Alert>
            )}

            {/* Seleção de formato */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-[0.04em] text-text-muted uppercase">
                Formato do arquivo
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {OPCOES_FORMATO.map((opcao) => {
                  const selecionado = formato === opcao.valor;
                  return (
                    <button
                      key={opcao.valor}
                      type="button"
                      disabled={exportando}
                      onClick={() => {
                        setFormato(opcao.valor);
                        limparMensagens();
                      }}
                      className={cn(
                        'flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60',
                        selecionado
                          ? 'border-primary bg-primary-soft/70 text-primary shadow-xs'
                          : 'border-border bg-surface text-text hover:border-border-strong hover:bg-surface-alt',
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        {opcao.icone === 'pdf' ? (
                          <FileText size={14} />
                        ) : (
                          <FileSpreadsheet size={14} />
                        )}
                        <span>{opcao.titulo}</span>
                      </div>
                      <span className="text-[0.6875rem] leading-snug text-text-muted">
                        {opcao.detalhe}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtro de período */}
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-semibold tracking-[0.04em] text-text-muted uppercase">
                Período (opcional)
              </span>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'mes', label: 'Este mês', onClick: () => aplicarAtalho(inicioMesAtual, hojeIso) },
                  { id: '30dias', label: 'Últimos 30 dias', onClick: () => aplicarAtalho(ultimos30Dias, hojeIso) },
                  { id: 'tudo', label: 'Todo o período', onClick: () => aplicarAtalho('', '') },
                ].map((atalho) => {
                  const ativo = atalhoAtivo === atalho.id;
                  return (
                    <button
                      key={atalho.id}
                      type="button"
                      disabled={exportando}
                      onClick={atalho.onClick}
                      className={cn(
                        'cursor-pointer rounded-md border px-2.5 py-1.5 text-center text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
                        ativo
                          ? 'border-primary bg-primary-soft/70 font-semibold text-primary'
                          : 'border-border bg-surface-alt text-text-strong hover:border-border-strong hover:bg-surface',
                      )}
                    >
                      {atalho.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Data inicial"
                  type="date"
                  disabled={exportando}
                  value={inicio}
                  onChange={(e) => {
                    limparMensagens();
                    setInicio(e.target.value);
                  }}
                />
                <Input
                  label="Data final"
                  type="date"
                  disabled={exportando}
                  value={fim}
                  onChange={(e) => {
                    limparMensagens();
                    setFim(e.target.value);
                  }}
                />
              </div>
            </div>

            {usuario?.perfil === PERFIS.GESTOR_FROTA && (
              <p className="m-0 rounded-md border border-border bg-surface-alt px-3 py-2 text-xs text-text-muted">
                Escopo do seu perfil: o arquivo conterá apenas registros da{' '}
                <strong className="text-text-strong">frota administrativa</strong>.
              </p>
            )}

            {usuario?.perfil === PERFIS.ADMINISTRADOR && tipo === 'viagens' && (
              <p className="m-0 rounded-md border border-border bg-surface-alt px-3 py-2 text-xs text-text-muted">
                Escopo do seu perfil: o relatório de viagens inclui registros das frotas{' '}
                <strong className="text-text-strong">administrativa e SVO</strong> (independente da
                aba ativa).
              </p>
            )}

            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                disabled={exportando}
                onClick={() => setAberto(false)}
              >
                {estado === 'sucesso' ? 'Fechar' : 'Cancelar'}
              </Button>
              <Button
                type="button"
                disabled={exportando}
                onClick={() => void handleExportar()}
              >
                {estado === 'exportando' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Gerando arquivo...
                  </>
                ) : estado === 'sucesso' ? (
                  <>
                    <CheckCircle2 size={14} /> Baixar novamente
                  </>
                ) : estado === 'erro' ? (
                  <>
                    <RotateCcw size={14} /> Tentar novamente
                  </>
                ) : (
                  <>
                    <Download size={14} /> Baixar relatório
                  </>
                )}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}
    </>
  );
}
