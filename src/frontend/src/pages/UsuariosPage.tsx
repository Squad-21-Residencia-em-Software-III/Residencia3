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

type FiltroCategoria =
  | 'TODOS'
  | 'ADMINISTRADOR'
  | 'GESTOR_FROTA'
  | 'GESTOR_SVO'
  | 'MOTORISTA_FROTA'
  | 'MOTORISTA_SVO'
  | 'SOLICITANTE'
  | 'INATIVOS';

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

  const [totaisGlobais, setTotaisGlobais] = useState({
    total: 0,
    ativos: 0,
    inativos: 0,
    motoristas: 0,
  });

  const carregarMetricasGlobais = useCallback(async () => {
    try {
      const [resAtivos, resInativos, resMotFrota, resMotSvo] = await Promise.all([
        usuariosApi.listar({ ativo: true, limite: 1 }),
        usuariosApi.listar({ ativo: false, limite: 1 }),
        usuariosApi.listar({ perfil: 'MOTORISTA_FROTA', limite: 1 }),
        usuariosApi.listar({ perfil: 'MOTORISTA_SVO', limite: 1 }),
      ]);
      const totalAtivos = resAtivos.paginacao.total;
      const totalInativos = resInativos.paginacao.total;
      const totalMotoristas = resMotFrota.paginacao.total + resMotSvo.paginacao.total;
      setTotaisGlobais({
        total: totalAtivos + totalInativos,
        ativos: totalAtivos,
        inativos: totalInativos,
        motoristas: totalMotoristas,
      });
    } catch {
      // Ignora erro ao obter métricas secundárias
    }
  }, []);

  const carregarUsuarios = useCallback(async () => {
    try {
      setCarregando(true);
      let perfilQuery: Perfil | undefined;
      let ativoQuery: boolean | undefined;

      if (filtro === 'INATIVOS') {
        ativoQuery = false;
      } else if (filtro !== 'TODOS') {
        perfilQuery = filtro as Perfil;
      }

      const resposta = await usuariosApi.listar({
        pagina,
        limite: 50,
        busca: busca.trim() || undefined,
        perfil: perfilQuery,
        ativo: ativoQuery,
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

  useEffect(() => {
    carregarMetricasGlobais();
  }, [carregarMetricasGlobais]);

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
      carregarMetricasGlobais();
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
      throw error;
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
      carregarMetricasGlobais();
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
      throw error;
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
          value={totaisGlobais.total || totalRegistros}
          tone="neutral"
          className="px-5 py-4"
        />
        <MetricCard label="Ativos" value={totaisGlobais.ativos} tone="success" className="px-5 py-4" />
        <MetricCard label="Inativos" value={totaisGlobais.inativos} tone="danger" className="px-5 py-4" />
        <MetricCard
          label="Motoristas Operacionais"
          value={totaisGlobais.motoristas}
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
              : `${totalRegistros} usuário${totalRegistros === 1 ? '' : 's'} encontrado${totalRegistros === 1 ? '' : 's'}`
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
              { value: 'ADMINISTRADOR', label: 'Administradores' },
              { value: 'GESTOR_FROTA', label: 'Gestores de Frota' },
              { value: 'GESTOR_SVO', label: 'Gestores SVO' },
              { value: 'MOTORISTA_FROTA', label: 'Motoristas de Frota' },
              { value: 'MOTORISTA_SVO', label: 'Motoristas SVO' },
              { value: 'SOLICITANTE', label: 'Solicitantes' },
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
            ) : erroCarga ? (
              <tr>
                <td colSpan={6} className="p-9 text-center text-rose-600">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="font-medium">Falha na comunicação com o servidor: {erroCarga}</p>
                    <Button variant="outline" size="sm" onClick={carregarUsuarios}>
                      Tentar novamente
                    </Button>
                  </div>
                </td>
              </tr>
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-9 text-center text-slate-500">
                  Nenhum usuário encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              usuarios.map((u) => {
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

        <Pagination
          currentPage={pagina}
          pageSize={50}
          totalItems={totalRegistros}
          onPageChange={(novaPagina) => setPagina(novaPagina)}
        />
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
