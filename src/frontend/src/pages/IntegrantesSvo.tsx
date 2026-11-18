import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, ConfirmDialog, Input, Select } from '../components/ui';
import { equipesSvoApi, type IntegranteSvo } from '../services/api/equipesSvoApi';
import { mensagemDeErro } from '../services/api/http';
import type { EquipeSvo } from '../types/equipeSvo';

export function IntegrantesSvo({ equipes }: { equipes: EquipeSvo[] }) {
  const [todos, setTodos] = useState<IntegranteSvo[]>([]);
  const [membros, setMembros] = useState<IntegranteSvo[]>([]);
  const [equipeId, setEquipeId] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [nome, setNome] = useState(''); const [email, setEmail] = useState(''); const [senha, setSenha] = useState('');
  const [editando, setEditando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [remover, setRemover] = useState<IntegranteSvo | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let ativo = true;
    equipesSvoApi.integrantes().then((v) => { if (ativo) setTodos(v); }).catch((e) => { if (ativo) setErro(mensagemDeErro(e)); });
    return () => { ativo = false; };
  }, [versao]);
  useEffect(() => {
    let ativo = true; setMembros([]);
    if (equipeId) equipesSvoApi.integrantesEquipe(Number(equipeId)).then((v) => { if (ativo) setMembros(v); }).catch((e) => { if (ativo) setErro(mensagemDeErro(e)); });
    return () => { ativo = false; };
  }, [equipeId, versao]);
  async function executar(acao: () => Promise<unknown>) {
    setOcupado(true); setErro(null);
    try { await acao(); setVersao((v) => v + 1); } catch (e) { setErro(mensagemDeErro(e)); }
    finally { setOcupado(false); }
  }
  async function criar(e: FormEvent) {
    e.preventDefault();
    await executar(async () => {
      if (editando === null) await equipesSvoApi.criarIntegrante({ nome, email, senha });
      else await equipesSvoApi.atualizarIntegrante(editando, { nome, email });
      setNome(''); setEmail(''); setSenha(''); setEditando(null);
    });
  }
  return <Card className="p-4 space-y-4">
    <h2 className="text-lg font-bold">Integrantes SVO</h2>
    {erro && <Alert tone="danger">{erro}</Alert>}
    <form onSubmit={(e) => void criar(e)} className="space-y-2">
      <Input label="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} required />
      <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {editando === null && <Input label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} maxLength={72} required />}
      <Button type="submit" disabled={ocupado}>{editando === null ? 'Cadastrar integrante' : 'Salvar integrante'}</Button>
      {editando !== null && <Button type="button" variant="ghost" onClick={() => { setEditando(null); setNome(''); setEmail(''); }}>Cancelar edição</Button>}
    </form>
    {todos.length > 0 && <ul>{todos.map((u) => <li key={u.id} className="flex items-center justify-between gap-2 py-2">
      <span>{u.nome} — {u.email}</span><Button type="button" variant="outline" size="sm" onClick={() => { setEditando(u.id); setNome(u.nome); setEmail(u.email); setSenha(''); }}>Editar {u.nome}</Button>
    </li>)}</ul>}
    <Select label="Equipe" value={equipeId} onChange={(e) => { setEquipeId(e.target.value); setUsuarioId(''); }}>
      <option value="">Selecione uma equipe</option>{equipes.map((e) => <option key={e.id} value={e.id}>{e.nome_equipe}</option>)}
    </Select>
    {equipeId && <>
      <Select label="Integrante para vincular" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
        <option value="">Selecione um integrante</option>{todos.filter((u) => !membros.some((m) => m.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </Select>
      <Button type="button" disabled={!usuarioId || ocupado} onClick={() => void executar(() => equipesSvoApi.vincular(Number(equipeId), Number(usuarioId)))}>Vincular</Button>
      {membros.length === 0 ? <p>Nenhum integrante vinculado.</p> : <ul>{membros.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 py-2">
        <span>{m.nome}</span><Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => setRemover(m)}>Desvincular</Button>
      </li>)}</ul>}
    </>}
    <ConfirmDialog isOpen={remover !== null} title="Desvincular integrante" description={`Deseja desvincular ${remover?.nome ?? ''} desta equipe?`}
      confirmLabel="Desvincular" isLoading={ocupado} onClose={() => setRemover(null)}
      onConfirm={async () => { if (remover) await executar(() => equipesSvoApi.desvincular(Number(equipeId), remover.id)); setRemover(null); }} />
  </Card>;
}
