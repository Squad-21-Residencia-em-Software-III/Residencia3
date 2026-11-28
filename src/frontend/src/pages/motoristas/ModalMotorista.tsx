import { useEffect, useId, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import { ApiError, mensagemDeErro } from '../../services/api/http';
import { motoristasApi } from '../../services/api/motoristasApi';
import type { AtualizarMotoristaInput, MotoristaDetalhe, UsuarioElegivel } from '../../types/motorista';
import { cn } from '../../utils/cn';
import {
  cnhVencida,
  combinarCategorias,
  dataCivilValida,
  erroCategoriaCnh,
  erroNumeroCnh,
  erroValidadeCnh,
  LETRAS_CATEGORIA_CNH,
  normalizarCnh,
} from '../../utils/cnh';

type Campo = 'usuario_id' | 'numero_cnh' | 'categoria_cnh' | 'validade_cnh';
type Erros = Partial<Record<Campo | 'geral', string>>;

type ModalMotoristaProps = {
  onClose: () => void;
  onSalvo: (motorista: MotoristaDetalhe) => void;
} & ({ modo: 'criar'; motoristaId?: never } | { modo: 'editar'; motoristaId: number });

const ROTULO_TIPO = { MOTORISTA_FROTA: 'Frota Administrativa', MOTORISTA_SVO: 'SVO' } as const;
const CAMPOS: Campo[] = ['usuario_id', 'numero_cnh', 'categoria_cnh', 'validade_cnh'];

/** Erros do servidor no campo certo: validação (detalhes[].campo) e conflitos 409 por código. */
function errosDaApi(erro: unknown): Erros {
  if (!(erro instanceof ApiError)) return { geral: mensagemDeErro(erro) };
  if (erro.codigo === 'CNH_DUPLICADA') return { numero_cnh: erro.message };
  if (erro.codigo === 'MOTORISTA_JA_CADASTRADO' || erro.codigo === 'USUARIO_NAO_ELEGIVEL') {
    return { usuario_id: erro.message };
  }
  const erros: Erros = {};
  for (const detalhe of erro.detalhes) {
    const campo = CAMPOS.find((c) => c === detalhe.campo);
    if (campo && !erros[campo]) erros[campo] = detalhe.mensagem;
  }
  return Object.keys(erros).length ? erros : { geral: erro.message };
}

export function ModalMotorista({ modo, motoristaId, onClose, onSalvo }: ModalMotoristaProps) {
  const idCategorias = useId();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [elegiveis, setElegiveis] = useState<UsuarioElegivel[]>([]);
  const [original, setOriginal] = useState<MotoristaDetalhe | null>(null);
  const [usuarioId, setUsuarioId] = useState('');
  const [cnh, setCnh] = useState('');
  const [letras, setLetras] = useState<string[]>([]);
  const [validade, setValidade] = useState('');
  const [erros, setErros] = useState<Erros>({});

  useEffect(() => {
    let ativo = true;
    const carga =
      modo === 'criar'
        ? motoristasApi.listarUsuariosElegiveis().then((lista) => ativo && setElegiveis(lista))
        : motoristasApi.buscar(motoristaId).then((m) => {
            if (!ativo) return;
            setOriginal(m);
            setCnh(m.numero_cnh);
            setLetras(m.categoria_cnh.split(''));
            setValidade(m.validade_cnh);
          });
    carga
      .catch((erro) => ativo && setErros({ geral: mensagemDeErro(erro) }))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [modo, motoristaId]);

  const categoria = combinarCategorias(letras);
  const usuarioSelecionado = elegiveis.find((u) => String(u.id) === usuarioId);
  const vencida = dataCivilValida(validade) && cnhVencida(validade);

  const alternarLetra = (letra: string) =>
    setLetras((atuais) => (atuais.includes(letra) ? atuais.filter((l) => l !== letra) : [...atuais, letra]));

  const validarNoCliente = (): Erros => {
    const novos: Erros = {};
    if (modo === 'criar' && !usuarioId) novos.usuario_id = 'Selecione o usuário motorista.';
    const numero = erroNumeroCnh(cnh);
    if (numero) novos.numero_cnh = numero;
    const cat = erroCategoriaCnh(categoria);
    if (cat) novos.categoria_cnh = cat;
    const val = erroValidadeCnh(validade);
    if (val) novos.validade_cnh = val;
    return novos;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const novos = validarNoCliente();
    setErros(novos);
    if (Object.keys(novos).length) return;

    setSalvando(true);
    try {
      let salvo: MotoristaDetalhe;
      if (modo === 'criar') {
        salvo = await motoristasApi.criar({
          usuario_id: Number(usuarioId),
          numero_cnh: normalizarCnh(cnh),
          categoria_cnh: categoria,
          validade_cnh: validade,
        });
      } else {
        // Só os campos alterados: os demais ficam como estão no servidor.
        const alteracoes: AtualizarMotoristaInput = {};
        if (normalizarCnh(cnh) !== original?.numero_cnh) alteracoes.numero_cnh = normalizarCnh(cnh);
        if (categoria !== original?.categoria_cnh) alteracoes.categoria_cnh = categoria;
        if (validade !== original?.validade_cnh) alteracoes.validade_cnh = validade;
        if (!Object.keys(alteracoes).length) {
          setErros({ geral: 'Nenhuma alteração para salvar.' });
          return;
        }
        salvo = await motoristasApi.atualizar(motoristaId, alteracoes);
      }
      onSalvo(salvo);
      onClose();
    } catch (erro) {
      setErros(errosDaApi(erro));
    } finally {
      setSalvando(false);
    }
  };

  const titulo = modo === 'criar' ? 'Cadastrar Motorista' : 'Editar CNH do Motorista';

  const tipoExibido =
    modo === 'criar'
      ? usuarioSelecionado
        ? ROTULO_TIPO[usuarioSelecionado.perfil]
        : ''
      : original
        ? ROTULO_TIPO[original.tipo_motorista === 'SVO' ? 'MOTORISTA_SVO' : 'MOTORISTA_FROTA']
        : '';

  // Mesmo padrão visual da Nova Solicitação: portal sobre a tela inteira, 560px, grade de 2 colunas.
  return (
    <Modal title={titulo} onClose={onClose} maxWidth="560px" telaInteira bloquearFechamento={salvando}>
      <form onSubmit={handleSubmit} noValidate aria-busy={carregando || salvando} className="grid gap-4">
        {erros.geral && <Alert tone="danger">{erros.geral}</Alert>}

        {/* Motorista (usuário existente) e tipo derivado do perfil */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {modo === 'criar' ? (
            <Select
              label="Usuário motorista *"
              value={usuarioId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setUsuarioId(e.target.value)}
              erro={erros.usuario_id}
              descricao={
                !carregando && elegiveis.length === 0
                  ? 'Nenhum usuário motorista sem cadastro. Crie o usuário com perfil de motorista primeiro.'
                  : undefined
              }
              disabled={carregando}
              required
            >
              <option value="">{carregando ? 'Carregando...' : 'Selecione'}</option>
              {elegiveis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          ) : (
            <Input label="Motorista" value={original?.nome ?? ''} placeholder="Carregando..." disabled />
          )}
          <Input
            label="Tipo de motorista"
            value={tipoExibido}
            placeholder="Definido pelo perfil do usuário"
            descricao={modo === 'criar' ? 'Vem do perfil do usuário selecionado.' : undefined}
            disabled
          />
        </div>

        {/* Número e validade */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Número da CNH *"
            placeholder="11 dígitos"
            inputMode="numeric"
            autoComplete="off"
            value={cnh}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCnh(e.target.value)}
            erro={erros.numero_cnh}
            descricao="Zeros à esquerda são mantidos. Pontos, hífens e espaços são ignorados."
            maxLength={20}
            disabled={carregando}
            required
          />
          <Input
            label="Validade da CNH *"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            value={validade}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setValidade(e.target.value)}
            erro={erros.validade_cnh}
            disabled={carregando}
            required
          />
        </div>

        {vencida && !erros.validade_cnh && (
          <Alert tone="warning">Esta CNH está vencida. O registro pode ser salvo, mas aparecerá como vencido.</Alert>
        )}

        {/* Categorias */}
        <fieldset
          className="m-0 flex flex-col gap-1.5 border-0 p-0"
          aria-describedby={erros.categoria_cnh ? `${idCategorias}-erro` : undefined}
        >
          <legend className="mb-1.5 font-display text-sm font-semibold text-text-secondary">Categoria da CNH *</legend>
          <div
            className={cn(
              'flex flex-wrap gap-2.5 rounded-md border-[1.5px] bg-surface p-2',
              erros.categoria_cnh ? 'border-danger' : 'border-border',
            )}
          >
            {LETRAS_CATEGORIA_CNH.map((letra) => {
              const selecionada = letras.includes(letra);
              return (
                <label
                  key={letra}
                  className={cn(
                    'flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[0.8125rem] transition-all duration-200',
                    selecionada
                      ? 'border-primary bg-primary-soft font-semibold text-primary'
                      : 'border-transparent bg-transparent text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selecionada}
                    onChange={() => alternarLetra(letra)}
                    disabled={carregando}
                    className="cursor-pointer"
                  />
                  {letra}
                </label>
              );
            })}
          </div>
          {erros.categoria_cnh && (
            <p id={`${idCategorias}-erro`} className="m-0 text-xs font-semibold text-danger-strong">
              {erros.categoria_cnh}
            </p>
          )}
        </fieldset>

        {/* Rodapé de ações */}
        <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" type="button" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={carregando || salvando}>
            {salvando ? 'Salvando...' : modo === 'criar' ? 'Cadastrar Motorista' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
