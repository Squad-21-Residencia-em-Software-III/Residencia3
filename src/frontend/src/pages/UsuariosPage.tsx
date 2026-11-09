import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { mensagemDeErro } from '../services/api/http';
import { usuariosApi } from '../services/api/usuariosApi';
import { useAuth } from '../contexts/AuthContext';
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
  const { usuario: usuarioLogado } = useAuth();
  const usuarioLogadoId = usuarioLogado?.id ?? 1;

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<FiltroCategoria>('TODOS');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);

  const [modalUsuarioAberto, setModalUsuarioAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioRedefinirSenha, setUsuarioRedefinirSenha] = useState<Usuario | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

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

  const carregarUsuarios = useCallback(async () => {
    try {
      setCarregando(true);
      const resposta = await usuariosApi.listar({
        pagina,
        limite: 50,
        busca: busca.trim() || undefined,
        ativo: filtro === 'INATIVOS' ? false : undefined,
      });
      setUsuarios(resposta.dados);
      setTotalRegistros(resposta.paginacao.total);
      setErroCarga(null);
    } catch (error) {
      setErroCarga(mensagemDeErro(error));
    } finally {
      setCarregando(false);
    }
  }, [pagina, busca, filtro]);

  useEffect(() => {
    carregarUsuarios();
  }, [carregarUsuarios]);

  const totais = useMemo(
    () => ({
      total: totalRegistros || usuarios.length,
      ativos: usuarios.filter((u) => u.ativo).length,
      inativos: usuarios.filter((u) => !u.ativo).length,
      motoristas: usuarios.filter((u) => u.tipo_usuario === 'MOTORISTA').length,
    }),
    [usuarios, totalRegistros],
  );

  const filtrados = useMemo(() => {
    return usuarios.filter((u) => {
      if (filtro === 'ADMIN' && u.perfil !== 'ADMINISTRADOR') return false;
      if (filtro === 'GESTAO' && u.perfil !== 'GESTOR_FROTA' && u.perfil !== 'GESTOR_SVO')
        return false;
      if (filtro === 'SOLICITANTE' && u.perfil !== 'SOLICITANTE') return false;
      if (filtro === 'MOTORISTA' && u.tipo_usuario !== 'MOTORISTA') return false;
      if (filtro === 'INATIVOS' && u.ativo) return false;
      return true;
    });
  }, [usuarios, filtro]);

  const emailsExistentes = useMemo(() => usuarios.map((u) => u.email), [usuarios]);

  const handleSalvarUsuario = async (dados: {
    nome: string;
    email: string;
    senha?: string;
    perfil: Perfil;
    ativo?: boolean;
  }) => {
    try {
      if (usuarioEditando) {
        await usuariosApi.atualizar(usuarioEditando.id, {
          nome: dados.nome,
          email: dados.email,
          perfil: dados.perfil,
          ativo: dados.ativo,
        });
        exibirFeedback(`Usuário "${dados.nome}" atualizado com sucesso.`);
      } else {
        await usuariosApi.criar({
          nome: dados.nome,
          email: dados.email,
          senha: dados.senha || '',
          perfil: dados.perfil,
        });
        exibirFeedback(`Usuário "${dados.nome}" cadastrado com sucesso.`);
      }
      setUsuarioEditando(null);
      carregarUsuarios();
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
    }
  };

  const handleAlternarStatus = async (usuario: Usuario) => {
    if (usuario.id === usuarioLogadoId) {
      exibirFeedback('Você não pode desativar a sua própria conta de administrador.', true);
      return;
    }
    try {
      await usuariosApi.atualizar(usuario.id, { ativo: !usuario.ativo });
      exibirFeedback(
        `Usuário "${usuario.nome}" foi ${!usuario.ativo ? 'ativado' : 'desativado'} com sucesso.`,
      );
      carregarUsuarios();
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
    }
  };

  const handleSalvarNovaSenha = async (novaSenha: string) => {
    if (!usuarioRedefinirSenha) return;
    try {
      await usuariosApi.redefinirSenha(usuarioRedefinirSenha.id, novaSenha);
      exibirFeedback(`Senha do usuário "${usuarioRedefinirSenha.nome}" redefinida com sucesso.`);
      setUsuarioRedefinirSenha(null);
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
    }
  };

  return (
    <div className="grid gap-6">
      {/* Feedback de sucesso e erro */}
      {(mensagemSucesso || mensagemErro || erroCarga) && (
        <Alert tone={mensagemErro || erroCarga ? 'danger' : 'success'}>
          {mensagemErro || erroCarga || mensagemSucesso}
        </Alert>
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
          subtitle={
            carregando
              ? 'Carregando usuários...'
              : `${filtrados.length} usuário${filtrados.length === 1 ? '' : 's'} listado${filtrados.length === 1 ? '' : 's'}`
          }
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
          <SearchInput
            value={busca}
            onChange={(val) => {
              setBusca(val);
              setPagina(1);
            }}
            placeholder="Buscar por nome ou e-mail..."
          />

          <FilterSelect
            aria-label="Filtrar por perfil"
            value={filtro}
            onChange={(val) => {
              setFiltro(val as FiltroCategoria);
              setPagina(1);
            }}
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
                setPagina(1);
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
            {carregando ? (
              <tr>
                <td colSpan={6} className="p-9 text-center text-slate-500">
                  Carregando lista de usuários da API...
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
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

        <Pagination showing={`1–${filtrados.length}`} total={totalRegistros || filtrados.length} />
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
