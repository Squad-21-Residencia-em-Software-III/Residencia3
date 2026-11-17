import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, Input } from '../components/ui';
import { equipesSvoApi } from '../services/api/equipesSvoApi';
import { mensagemDeErro } from '../services/api/http';
import type { EquipeSvo } from '../types/equipeSvo';

export default function EquipesSvoPage() {
  const [equipes, setEquipes] = useState<EquipeSvo[]>([]);
  const [nome, setNome] = useState('');
  const [editando, setEditando] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    equipesSvoApi.listar().then((dados) => { if (ativo) setEquipes(dados); })
      .catch((e) => { if (ativo) setErro(mensagemDeErro(e)); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const valor = nome.trim();
    if (!valor) { setErro('Informe o nome da equipe.'); return; }
    setSalvando(true); setErro(null); setSucesso(null);
    try {
      const equipe = editando === null ? await equipesSvoApi.criar(valor) : await equipesSvoApi.atualizar(editando, valor);
      setEquipes((atual) => [...atual.filter((item) => item.id !== equipe.id), equipe]
        .sort((a, b) => a.nome_equipe.localeCompare(b.nome_equipe, 'pt-BR')));
      setNome(''); setEditando(null); setSucesso('Equipe salva com sucesso.');
    } catch (e) { setErro(mensagemDeErro(e)); }
    finally { setSalvando(false); }
  }

  return <div className="space-y-4">
    <h1 className="text-xl font-bold text-navy-900">Equipes SVO</h1>
    {erro && <Alert tone="danger">{erro}</Alert>}
    {sucesso && <Alert tone="success">{sucesso}</Alert>}
    <Card className="p-4">
      <form onSubmit={(e) => void salvar(e)} className="space-y-3">
        <Input label="Nome da equipe" value={nome} maxLength={100} required onChange={(e) => setNome(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : editando === null ? 'Cadastrar equipe' : 'Salvar alterações'}</Button>
          {editando !== null && <Button type="button" variant="ghost" onClick={() => { setEditando(null); setNome(''); setErro(null); }}>Cancelar edição</Button>}
        </div>
      </form>
    </Card>
    <Card className="p-4">
      {carregando ? <p>Carregando equipes...</p> : erro && equipes.length === 0 ? <p>Não foi possível carregar as equipes.</p> : equipes.length === 0 ? <p>Nenhuma equipe cadastrada.</p> :
        <ul className="divide-y divide-slate-200">{equipes.map((equipe) => <li key={equipe.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span>#{equipe.id} {equipe.nome_equipe}</span>
          <Button type="button" variant="outline" size="sm" aria-label={`Editar ${equipe.nome_equipe}`} onClick={() => { setEditando(equipe.id); setNome(equipe.nome_equipe); setSucesso(null); }}>Editar</Button>
        </li>)}</ul>}
    </Card>
  </div>;
}
