import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Textarea } from '../../components/ui';
import { evidenciasOdometroApi } from '../../services/api/evidenciasOdometroApi';
import { mensagemDeErro } from '../../services/api/http';
import { LABELS_FASE_ODOMETRO, type DecisaoExcecaoOdometro, type PedidoExcecaoOdometro } from '../../types/evidenciaOdometro';
import type { TipoOperacaoViagem } from '../../types/viagem';

type Fila = Awaited<ReturnType<typeof evidenciasOdometroApi.listarExcecoes>>;

export function ModalExcecoesOdometro({ tipo, onClose }: { tipo: TipoOperacaoViagem; onClose: () => void }) {
  const [pagina, setPagina] = useState(1);
  const [revisao, setRevisao] = useState(0);
  const [fila, setFila] = useState<Fila | null>(null);
  const [pedido, setPedido] = useState<PedidoExcecaoOdometro | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setFila(null);
    evidenciasOdometroApi.listarExcecoes(tipo, pagina).then(
      (resultado) => { if (ativo) setFila(resultado); },
      (falha) => { if (ativo) setErro(mensagemDeErro(falha)); },
    );
    return () => { ativo = false; };
  }, [tipo, pagina, revisao]);

  const decidir = async (decisao: DecisaoExcecaoOdometro) => {
    if (!pedido || salvando || justificativa.trim().length < 10) return;
    setSalvando(true);
    setErro(null);
    try {
      await evidenciasOdometroApi.decidirExcecao(pedido, decisao, justificativa.trim());
      setPedido(null);
      setJustificativa('');
      setPagina(1);
      setRevisao((atual) => atual + 1);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setSalvando(false);
    }
  };

  function atualizar(novaPagina: number) {
    setPedido(null);
    setJustificativa('');
    setErro(null);
    setPagina(novaPagina);
    setRevisao((atual) => atual + 1);
  }

  return (
    <Modal telaInteira gerenciarFoco bloquearFechamento={salvando} onClose={onClose}
      title={tipo === 'SVO' ? 'Pedidos sem foto · SVO' : 'Pedidos sem foto · Administrativo'}>
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      {!fila && !erro && <p role="status">Carregando pedidos…</p>}
      {fila?.dados.length === 0 && <p>Nenhum pedido pendente nesta página.</p>}
      <ul className="grid gap-3">
        {fila?.dados.map((item) => (
          <li key={item.id} className="min-w-0 rounded-md border border-slate-200 p-3">
            <h3 className="font-semibold">#{item.viagem_id} · {LABELS_FASE_ODOMETRO[item.fase]}</h3>
            <p className="text-sm">{item.motorista_nome} · {new Date(item.solicitada_em).toLocaleString('pt-BR')}</p>
            <p className="my-2 text-sm break-words">{item.motivo}</p>
            {pedido?.id === item.id ? (
              <>
                <Textarea label="Justificativa da decisão" value={justificativa} maxLength={500}
                  placeholder="Informe pelo menos 10 caracteres" disabled={salvando}
                  onChange={(evento) => setJustificativa(evento.target.value)} />
                <div className="flex flex-wrap gap-2 [&>button]:min-h-11">
                  <Button type="button" disabled={salvando || justificativa.trim().length < 10}
                    onClick={() => void decidir('APROVADA')}>Aprovar</Button>
                  <Button type="button" variant="outline" disabled={salvando || justificativa.trim().length < 10}
                    onClick={() => void decidir('RECUSADA')}>Recusar</Button>
                </div>
              </>
            ) : (
              <Button type="button" variant="outline" className="min-h-11" disabled={salvando}
                onClick={() => { setPedido(item); setJustificativa(''); setErro(null); }}>
                Analisar pedido #{item.id}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 [&>button]:min-h-11">
        <Button type="button" variant="outline" disabled={salvando} onClick={() => atualizar(pagina)}>Atualizar</Button>
        {pagina > 1 && <Button type="button" variant="outline" disabled={salvando} onClick={() => atualizar(pagina - 1)}>Anterior</Button>}
        {fila?.tem_mais && <Button type="button" variant="outline" disabled={salvando} onClick={() => atualizar(pagina + 1)}>Próxima</Button>}
      </div>
    </Modal>
  );
}
