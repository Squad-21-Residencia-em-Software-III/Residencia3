import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  FilterSelect,
  MetricCard,
  Pagination,
  SearchInput,
  Table,
  TableFilterCollapse,
  TableToolbar,
  type BadgeTone,
} from '../components/ui';
import { LABELS_PERFIS, type Perfil, type Usuario } from '../types/usuario';
import { storageService } from '../services/storageService';
import { ModalUsuario } from './usuarios/ModalUsuario';
import { ModalRedefinirSenha } from './usuarios/ModalRedefinirSenha';
import { GestoresUnidadesSecao } from './usuarios/GestoresUnidadesSecao';

type FiltroCategoria = 'TODOS' | 'ADMIN' | 'GESTAO' | 'SOLICITANTE' | 'MOTORISTA' | 'INATIVOS';

function obterBadgeTonePerfil(perfil: Perfil): BadgeTone {
  switch (perfil) {
    case 'ADMINISTRADOR':
      return 'purple';
    case 'GESTOR_FROTA':
    case 'GESTOR_SVO':
      return 'info';
    case 'MOTORISTA_FROTA':
    case 'MOTORISTA_SVO':
      return 'warning';
    case 'SOLICITANTE':
    default:
      return 'neutral';
  }
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>(storageService.getUsuarios());
  const [filtro, setFiltro] = useState<FiltroCategoria>('TODOS');
  const [busca, setBusca] = useState('');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  const [modalUsuarioAberto, setModalUsuarioAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioRedefinirSenha, setUsuarioRedefinirSenha] = useState<Usuario | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Usuário 1 (Carlos Silva - Admin) simula o usuário logado
  const usuarioLogadoId = 1;

  const exibirFeedback = (msg: string, isError = false) => {
    if (isError) {
      setMensagemErro(msg);
      setMensagemSucesso(null);
    } else {
      setMensagemSucesso(msg);
      setMensagemErro(null);
    }
    setTimeout(() => {
      setMensagemSucesso(null);
      setMensagemErro(null);
    }, 4000);
  };

  const totais = useMemo(
    () => ({
      total: usuarios.length,
      ativos: usuarios.filter((u) => u.ativo).length,
      inativos: usuarios.filter((u) => !u.ativo).length,
      motoristas: usuarios.filter((u) => u.tipo_usuario === 'MOTORISTA').length,
    }),
    [usuarios],
  );

  const filtrados = useMemo(() => {
    return usuarios.filter((u) => {
      // 1. Filtro de categoria / abas
      if (filtro === 'ADMIN' && u.perfil !== 'ADMINISTRADOR') return false;
      if (filtro === 'GESTAO' && u.perfil !== 'GESTOR_FROTA' && u.perfil !== 'GESTOR_SVO')
        return false;
      if (filtro === 'SOLICITANTE' && u.perfil !== 'SOLICITANTE') return false;
      if (filtro === 'MOTORISTA' && u.tipo_usuario !== 'MOTORISTA') return false;
      if (filtro === 'INATIVOS' && u.ativo) return false;

      // 2. Busca por texto (nome ou e-mail com ILIKE simulado)
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const matchNome = u.nome.toLowerCase().includes(termo);
        const matchEmail = u.email.toLowerCase().includes(termo);
        if (!matchNome && !matchEmail) return false;
      }

      return true;
    });
  }, [usuarios, filtro, busca]);

  const emailsExistentes = useMemo(() => usuarios.map((u) => u.email), [usuarios]);

  const handleSalvarUsuario = (dados: {
    nome: string;
    email: string;
    senha?: string;
    perfil: Perfil;
    ativo?: boolean;
  }) => {
    try {
      if (usuarioEditando) {
        // Edição
        storageService.updateUsuario(usuarioEditando.id, {
          nome: dados.nome,
          email: dados.email,
          perfil: dados.perfil,
          ativo: dados.ativo,
        });
        setUsuarios(storageService.getUsuarios());
        exibirFeedback(`Usuário "${dados.nome}" atualizado com sucesso.`);
      } else {
        // Novo cadastro
        storageService.createUsuario({
          nome: dados.nome,
          email: dados.email,
          senha: dados.senha || '',
          perfil: dados.perfil,
        });
        setUsuarios(storageService.getUsuarios());
        exibirFeedback(`Usuário "${dados.nome}" cadastrado com sucesso.`);
      }
      setUsuarioEditando(null);
    } catch (error: any) {
      exibirFeedback(error.message, true);
    }
  };

  const handleAlternarStatus = (usuario: Usuario) => {
    if (usuario.id === usuarioLogadoId) {
      exibirFeedback('Você não pode desativar a sua própria conta de administrador.', true);
      return;
    }
    try {
      storageService.toggleStatusUsuario(usuario.id, !usuario.ativo);
      setUsuarios(storageService.getUsuarios());
      exibirFeedback(
        `Usuário "${usuario.nome}" foi ${!usuario.ativo ? 'ativado' : 'desativado'} com sucesso.`,
      );
    } catch (error: any) {
      exibirFeedback(error.message, true);
    }
  };

  const handleSalvarNovaSenha = (novaSenha: string) => {
    if (!usuarioRedefinirSenha) return;
    // No backend é feito via PATCH /api/usuarios/:id/senha com hash bcrypt
    console.log(`Senha redefinida para o usuário id=${usuarioRedefinirSenha.id}: ${novaSenha}`);
    exibirFeedback(`Senha do usuário "${usuarioRedefinirSenha.nome}" redefinida com sucesso.`);
    setUsuarioRedefinirSenha(null);
  };

  return (
    <div className="grid gap-6">
      {/* Feedback de sucesso e erro */}
      {(mensagemSucesso || mensagemErro) && (
        <Alert tone={mensagemErro ? 'danger' : 'success'}>{mensagemErro || mensagemSucesso}</Alert>
      )}

      {/* 4 Cards de Resumo (2x2 no mobile) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          label="Total de Usuários"
          value={totais.total}
          tone="neutral"
          className="px-5 py-4"
        />
        <MetricCard label="Ativos" value={totais.ativos} tone="success" className="px-5 py-4" />
        <MetricCard label="Inativos" value={totais.inativos} tone="danger" className="px-5 py-4" />
        <MetricCard
          label="Motoristas Operacionais"
          value={totais.motoristas}
          tone="warning"
          className="px-5 py-4"
        />
      </div>

      <Card>
        <TableToolbar
          title="Gestão de Usuários"
          subtitle={`${filtrados.length} usuários listados`}
          newLabel="Novo Usuário"
          onNew={() => {
            setUsuarioEditando(null);
            setModalUsuarioAberto(true);
          }}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={filtro !== 'TODOS' || Boolean(busca) || filtrosAbertosMobile}
        />

        {/* Barra de Filtros e Busca */}
        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          {/* Busca textual na esquerda */}
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por nome ou e-mail..."
          />

          {/* Filtros em dropdown na sequência */}
          <FilterSelect
            aria-label="Filtrar por perfil"
            value={filtro}
            onChange={(val) => setFiltro(val as FiltroCategoria)}
            options={[
              { value: 'TODOS', label: 'Todos os perfis' },
              { value: 'ADMIN', label: 'Administradores' },
              { value: 'GESTAO', label: 'Gestores' },
              { value: 'SOLICITANTE', label: 'Solicitantes' },
              { value: 'MOTORISTA', label: 'Motoristas' },
              { value: 'INATIVOS', label: 'Usuários Inativos' },
            ]}
          />

          {(filtro !== 'TODOS' || busca) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca('');
                setFiltro('TODOS');
              }}
            >
              Limpar
            </Button>
          )}
        </TableFilterCollapse>

        {/* Tabela de Usuários */}
        <Table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Categoria</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-9 text-center text-slate-500">
                  Nenhum usuário encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtrados.map((u) => {
                const isProprio = u.id === usuarioLogadoId;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.nome} size={32} />
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            {u.nome}
                            {isProprio && (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                                Você
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">ID #{u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-[13px] text-slate-500">{u.email}</span>
                    </td>
                    <td>
                      <Badge tone={obterBadgeTonePerfil(u.perfil)}>{LABELS_PERFIS[u.perfil]}</Badge>
                    </td>
                    <td>
                      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        {u.tipo_usuario}
                      </span>
                    </td>
                    <td>
                      <Badge tone={u.ativo ? 'success' : 'neutral'}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          title="Editar dados cadastrais"
                          onClick={() => {
                            setUsuarioEditando(u);
                            setModalUsuarioAberto(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Redefinir senha de acesso"
                          onClick={() => setUsuarioRedefinirSenha(u)}
                        >
                          Senha
                        </Button>
                        <Button
                          variant={u.ativo && !isProprio ? 'danger-outline' : 'outline'}
                          size="sm"
                          disabled={isProprio}
                          title={
                            isProprio
                              ? 'Você não pode desativar sua própria conta'
                              : u.ativo
                                ? 'Desativar usuário'
                                : 'Ativar usuário'
                          }
                          onClick={() => handleAlternarStatus(u)}
                          className={
                            !isProprio && !u.ativo
                              ? 'border-success text-success hover:bg-success-bg'
                              : undefined
                          }
                        >
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${filtrados.length}`} total={filtrados.length} />
      </Card>

      {/* Associação de gestores às unidades (BL15) — dados vêm da API */}
      <GestoresUnidadesSecao onFeedback={exibirFeedback} />

      {/* Modal de Cadastro / Edição */}
      {modalUsuarioAberto && (
        <ModalUsuario
          usuarioEditando={usuarioEditando}
          emailsExistentes={emailsExistentes}
          usuarioLogadoId={usuarioLogadoId}
          onClose={() => {
            setModalUsuarioAberto(false);
            setUsuarioEditando(null);
          }}
          onSalvar={handleSalvarUsuario}
        />
      )}

      {/* Modal de Redefinição de Senha */}
      {usuarioRedefinirSenha && (
        <ModalRedefinirSenha
          usuario={usuarioRedefinirSenha}
          onClose={() => setUsuarioRedefinirSenha(null)}
          onSalvar={handleSalvarNovaSenha}
        />
      )}
    </div>
  );
}
