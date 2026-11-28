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

  return (
    <Modal title={titulo} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate aria-busy={carregando || salvando}>
        {erros.geral && (
          <Alert tone="danger" className="mb-4">
            {erros.geral}
          </Alert>
        )}

        {modo === 'criar' ? (
          <>
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
            <p className="mb-4 text-[0.8125rem] text-slate-600">
              Tipo de motorista:{' '}
              <strong>{usuarioSelecionado ? ROTULO_TIPO[usuarioSelecionado.perfil] : 'definido pelo perfil do usuário'}</strong>
            </p>
          </>
        ) : (
          <p className="mb-4 text-[0.8125rem] text-slate-700">
            Motorista: <strong>{original?.nome ?? '...'}</strong>
          </p>
        )}

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

        <fieldset className="mb-4" aria-describedby={erros.categoria_cnh ? `${idCategorias}-erro` : undefined}>
          <legend className="mb-2 block text-[0.8125rem] font-semibold text-slate-900">Categoria da CNH *</legend>
          <div
            className={cn(
              'flex flex-wrap gap-2.5 rounded-md border bg-white p-2',
              erros.categoria_cnh ? 'border-danger' : 'border-slate-200',
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
            <p id={`${idCategorias}-erro`} className="mt-1.5 text-xs font-semibold text-danger-strong">
              {erros.categoria_cnh}
            </p>
          )}
        </fieldset>

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

        {vencida && !erros.validade_cnh && (
          <Alert tone="warning" className="mb-4">
            Esta CNH está vencida. O registro pode ser salvo, mas aparecerá como vencido.
          </Alert>
        )}

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={carregando || salvando}>
            {salvando ? 'Salvando...' : modo === 'criar' ? 'Cadastrar Motorista' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
