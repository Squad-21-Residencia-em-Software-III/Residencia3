import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, PageHeader } from '../components/ui';
import { useMarcarReferenciaLida } from '../contexts/NotificacoesContext';
import { mensagemDeErro, request } from '../services/api/http';
import { toneStatusOrdem } from './triagemSvo/formatacao';
import { LABELS_STATUS_ORDEM_SVO, type StatusOrdemSvo } from '../types/solicitacaoSvo';

interface Coleta { id: number; status: StatusOrdemSvo; origem: string | null; inicio_previsto: string | null;
  fim_previsto: string | null; data_hora_saida: string | null; data_hora_conclusao: string | null;
  veiculo_modelo: string | null; veiculo_placa: string | null; motorista_nome: string | null }
interface Resposta { dados: Coleta[]; paginacao: { pagina: number; totalPaginas: number } }
const data = (valor: string | null) => valor ? new Date(valor).toLocaleString('pt-BR') : 'Não informado';

export default function MinhasColetasSvoPage() {
  const [pagina, setPagina] = useState(1); const [resultado, setResultado] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null); const [carregando, setCarregando] = useState(true);
  const [coletaAberta, setColetaAberta] = useState<number | null>(null);
  useMarcarReferenciaLida('ORDEM_SVO', coletaAberta);
  useEffect(() => {
    let ativo = true; setCarregando(true); setErro(null);
    request<Resposta>('GET', '/viagens/coletas-svo/minhas', { query: { pagina, limite: 20 } })
      .then((r) => { if (ativo) setResultado(r); }).catch((e) => { if (ativo) setErro(mensagemDeErro(e)); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [pagina]);
  const mudarPagina = (deslocamento: number) => {
    setColetaAberta(null);
    setPagina((atual) => atual + deslocamento);
  };
  return <div className="space-y-4"><PageHeader title="Minhas coletas" />
    {erro && <Alert tone="danger">{erro}</Alert>}
    {carregando ? <p>Carregando coletas...</p> : !erro && resultado?.dados.length === 0 ? <p>Nenhuma coleta designada.</p> :
      !erro && resultado?.dados.map((c) => <Card key={c.id} className="p-4 space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 font-bold">
          Coleta #{c.id}
          <Badge tone={toneStatusOrdem(c.status)}>{LABELS_STATUS_ORDEM_SVO[c.status] ?? c.status}</Badge>
        </h2>
        <Button type="button" variant="outline" aria-expanded={coletaAberta === c.id}
          onClick={() => setColetaAberta((atual) => atual === c.id ? null : c.id)}>
          {coletaAberta === c.id ? 'Fechar detalhes' : 'Ver detalhes'}
        </Button>
        {coletaAberta === c.id && <div>
        <p>Origem: {c.origem ?? 'Não informada'}</p>
        <p>Veículo: {c.veiculo_modelo ?? 'Não informado'} {c.veiculo_placa ?? ''}</p>
        <p>Motorista: {c.motorista_nome ?? 'Não informado'}</p>
        <p>Prevista: {data(c.inicio_previsto)} a {data(c.fim_previsto)}</p>
        <p>Início real: {data(c.data_hora_saida)}; conclusão: {data(c.data_hora_conclusao)}</p>
        </div>}
      </Card>)}
    {resultado && <div className="flex gap-2"><Button type="button" variant="outline" disabled={pagina <= 1 || carregando} onClick={() => mudarPagina(-1)}>Anterior</Button>
      <span>Página {pagina}</span><Button type="button" variant="outline" disabled={pagina >= resultado.paginacao.totalPaginas || carregando} onClick={() => mudarPagina(1)}>Próxima</Button></div>}
  </div>;
}
