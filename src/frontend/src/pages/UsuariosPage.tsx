import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Pagination,
  Table,
  TableToolbar,
  type BadgeTone,
} from '../components/ui';
import {
  LABELS_PERFIS,
  tipoUsuarioDoPerfil,
  type Perfil,
  type Usuario,
} from '../types/usuario';
import { MOCK_USUARIOS } from '../services/mocks/usuariosMock';
import { ModalUsuario } from './usuarios/ModalUsuario';
import { ModalRedefinirSenha } from './usuarios/ModalRedefinirSenha';

type FiltroCategoria = 'TODOS' | 'ADMIN' | 'GESTAO' | 'SOLICITANTE' | 'MOTORISTA' | 'INATIVOS';

const cardValor = (cor: string) => ({
  fontSize: '24px',
  fontWeight: 800,
  color: cor,
  fontFamily: 'var(--font-display)',
});
const cardRotulo = { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' };

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
  const [usuarios, setUsuarios] = useState<Usuario[]>(MOCK_USUARIOS);
  const [filtro, setFiltro] = useState<FiltroCategoria>('TODOS');
  const [busca, setBusca] = useState('');
  const [modalUsuarioAberto, setModalUsuarioAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioRedefinirSenha, setUsuarioRedefinirSenha] = useState<Usuario | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Usuário 1 (Carlos Silva - Admin) simula o usuário logado
  const usuarioLogadoId = 1;

  const exibirFeedback = (msg: string) => {
    setMensagemSucesso(msg);
    setTimeout(() => setMensagemSucesso(null), 4000);
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
      if (filtro === 'GESTAO' && u.perfil !== 'GESTOR_FROTA' && u.perfil !== 'GESTOR_SVO') return false;
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
    if (usuarioEditando) {
      // Edição
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuarioEditando.id
            ? {
                ...u,
                nome: dados.nome,
                email: dados.email,
                perfil: dados.perfil,
                tipo_usuario: tipoUsuarioDoPerfil(dados.perfil),
                ativo: dados.ativo !== undefined ? dados.ativo : u.ativo,
              }
            : u,
        ),
      );
      exibirFeedback(`Usuário "${dados.nome}" atualizado com sucesso.`);
    } else {
      // Novo cadastro
      const novoId = Math.max(0, ...usuarios.map((u) => u.id)) + 1;
      const novo: Usuario = {
        id: novoId,
        nome: dados.nome,
        email: dados.email,
        perfil: dados.perfil,
        tipo_usuario: tipoUsuarioDoPerfil(dados.perfil),
        ativo: true,
      };
      setUsuarios([novo, ...usuarios]);
      exibirFeedback(`Usuário "${dados.nome}" cadastrado com sucesso.`);
    }
    setUsuarioEditando(null);
  };

  const handleAlternarStatus = (usuario: Usuario) => {
    if (usuario.id === usuarioLogadoId) {
      alert('Você não pode desativar a sua própria conta de administrador.');
      return;
    }
    const novoStatus = !usuario.ativo;
    setUsuarios((prev) =>
      prev.map((u) => (u.id === usuario.id ? { ...u, ativo: novoStatus } : u)),
    );
    exibirFeedback(
      `Usuário "${usuario.nome}" foi ${novoStatus ? 'ativado' : 'desativado'} com sucesso.`,
    );
  };

  const handleSalvarNovaSenha = (novaSenha: string) => {
    if (!usuarioRedefinirSenha) return;
    // No backend é feito via PATCH /api/usuarios/:id/senha com hash bcrypt
    console.log(`Senha redefinida para o usuário id=${usuarioRedefinirSenha.id}: ${novaSenha}`);
    exibirFeedback(`Senha do usuário "${usuarioRedefinirSenha.nome}" redefinida com sucesso.`);
    setUsuarioRedefinirSenha(null);
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Feedback de sucesso */}
      {mensagemSucesso && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-success)',
            color: 'var(--color-success)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          ✓ {mensagemSucesso}
        </div>
      )}

      {/* 4 Cards de Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-text)')}>{totais.total}</div>
          <div style={cardRotulo}>Total de Usuários</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-success)')}>{totais.ativos}</div>
          <div style={cardRotulo}>Ativos</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-danger)')}>{totais.inativos}</div>
          <div style={cardRotulo}>Inativos</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-warning)')}>{totais.motoristas}</div>
          <div style={cardRotulo}>Motoristas Operacionais</div>
        </Card>
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
        />

        {/* Barra de Filtros e Busca */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            padding: '12px 24px',
            borderBottom: '1px solid var(--color-divider)',
            background: 'var(--color-surface-alt)',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Abas rápidas */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'TODOS', label: 'Todos' },
                { id: 'ADMIN', label: 'Administradores' },
                { id: 'GESTAO', label: 'Gestores' },
                { id: 'SOLICITANTE', label: 'Solicitantes' },
                { id: 'MOTORISTA', label: 'Motoristas' },
                { id: 'INATIVOS', label: 'Inativos' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: filtro === f.id ? 'var(--color-primary)' : 'transparent',
                  color: filtro === f.id ? '#ffffff' : 'var(--color-text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Campo de Busca por Nome ou E-mail */}
          <div style={{ minWidth: '240px', flex: '1', maxWidth: '360px' }}>
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={busca}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: '13px',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Tabela de Usuários */}
        <Table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Categoria</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
                  Nenhum usuário encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtrados.map((u) => {
                const isProprio = u.id === usuarioLogadoId;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={u.nome} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {u.nome}
                            {isProprio && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '10px',
                                  background: 'var(--color-surface-alt)',
                                  border: '1px solid var(--color-border)',
                                  color: 'var(--color-text-muted)',
                                }}
                              >
                                Você
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            ID #{u.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{u.email}</span>
                    </td>
                    <td>
                      <Badge tone={obterBadgeTonePerfil(u.perfil)}>
                        {LABELS_PERFIS[u.perfil]}
                      </Badge>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--color-surface-alt)',
                          color: 'var(--color-text-muted)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        {u.tipo_usuario}
                      </span>
                    </td>
                    <td>
                      <Badge tone={u.ativo ? 'success' : 'neutral'}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Button
                          variant="ghost"
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
                          variant="ghost"
                          size="sm"
                          title="Redefinir senha de acesso"
                          onClick={() => setUsuarioRedefinirSenha(u)}
                        >
                          Senha
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isProprio}
                          title={isProprio ? 'Você não pode desativar sua própria conta' : (u.ativo ? 'Desativar usuário' : 'Ativar usuário')}
                          onClick={() => handleAlternarStatus(u)}
                          style={{
                            color: isProprio ? 'var(--color-text-muted)' : (u.ativo ? 'var(--color-danger)' : 'var(--color-success)'),
                          }}
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
