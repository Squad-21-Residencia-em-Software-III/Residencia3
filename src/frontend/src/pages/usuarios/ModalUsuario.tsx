import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import {
  DESCRICAO_PERFIS,
  LABELS_PERFIS,
  LISTA_PERFIS,
  tipoUsuarioDoPerfil,
  type Perfil,
  type Usuario,
} from '../../types/usuario';

interface ModalUsuarioProps {
  usuarioEditando?: Usuario | null;
  emailsExistentes: string[];
  usuarioLogadoId?: number;
  onClose: () => void;
  onSalvar: (dados: {
    nome: string;
    email: string;
    senha?: string;
    perfil: Perfil;
    ativo?: boolean;
  }) => void;
}

function validarSenhaForte(senha: string): string | null {
  if (senha.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (!/[A-Z]/.test(senha)) return 'A senha deve conter ao menos uma letra maiúscula.';
  if (!/[a-z]/.test(senha)) return 'A senha deve conter ao menos uma letra minúscula.';
  if (!/[0-9]/.test(senha)) return 'A senha deve conter ao menos um número.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(senha)) {
    return 'A senha deve conter ao menos um caractere especial (!@#$%...).';
  }
  return null;
}

export function ModalUsuario({
  usuarioEditando,
  emailsExistentes,
  usuarioLogadoId = 1,
  onClose,
  onSalvar,
}: ModalUsuarioProps) {
  const isEdicao = Boolean(usuarioEditando);

  const [nome, setNome] = useState(usuarioEditando?.nome ?? '');
  const [email, setEmail] = useState(usuarioEditando?.email ?? '');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [perfil, setPerfil] = useState<Perfil>(usuarioEditando?.perfil ?? 'SOLICITANTE');
  const [ativo, setAtivo] = useState(usuarioEditando?.ativo ?? true);
  const [erro, setErro] = useState('');

  const isProprioUsuario = isEdicao && usuarioEditando?.id === usuarioLogadoId;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const nomeTrim = nome.trim();
    const emailTrim = email.trim().toLowerCase();

    if (!nomeTrim || nomeTrim.length < 3) {
      setErro('O nome deve conter pelo menos 3 caracteres.');
      return;
    }

    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setErro('Informe um e-mail válido.');
      return;
    }

    const emailJaExiste = emailsExistentes.some(
      (em) =>
        em.toLowerCase() === emailTrim && em.toLowerCase() !== usuarioEditando?.email.toLowerCase(),
    );
    if (emailJaExiste) {
      setErro('Já existe um usuário cadastrado com este e-mail.');
      return;
    }

    // Validações de auto-proteção do administrador logado (regras do backend)
    if (isProprioUsuario) {
      if (!ativo) {
        setErro('Você não pode desativar a sua própria conta de administrador.');
        return;
      }
      if (perfil !== 'ADMINISTRADOR') {
        setErro('Você não pode remover o perfil de administrador da sua própria conta.');
        return;
      }
    }

    if (!isEdicao) {
      const erroSenha = validarSenhaForte(senha);
      if (erroSenha) {
        setErro(erroSenha);
        return;
      }
      if (senha !== confirmarSenha) {
        setErro('A confirmação de senha não confere com a senha digitada.');
        return;
      }
    }

    onSalvar({
      nome: nomeTrim,
      email: emailTrim,
      ...(isEdicao ? { ativo } : { senha }),
      perfil,
    });

    onClose();
  };

  const tipoPrevisao = tipoUsuarioDoPerfil(perfil);

  return (
    <Modal title={isEdicao ? 'Editar Usuário' : 'Cadastrar Usuário'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        {isProprioUsuario && (
          <Alert tone="info" className="mb-4">
            Você está editando sua própria conta. Por segurança, seu perfil e status ativo estão
            fixados.
          </Alert>
        )}

        <Input
          label="Nome Completo *"
          placeholder="Ex: João Silva"
          value={nome}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNome(e.target.value)}
          minLength={3}
          maxLength={255}
          required
        />

        <Input
          label="E-mail Institucional *"
          type="email"
          placeholder="Ex: joao.silva@fsph.org.br"
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          maxLength={255}
          required
        />

        <div className="mb-4">
          <Select
            label="Perfil de Acesso *"
            value={perfil}
            disabled={isProprioUsuario}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setPerfil(e.target.value as Perfil)}
          >
            {LISTA_PERFIS.map((p) => (
              <option key={p} value={p}>
                {LABELS_PERFIS[p]}
              </option>
            ))}
          </Select>
          <div className="mt-1 text-xs leading-snug text-slate-500">{DESCRICAO_PERFIS[perfil]}</div>
          <div className="mt-1 text-[11px] font-semibold text-primary">
            Tipo de usuário no banco: {tipoPrevisao}
          </div>
        </div>

        {!isEdicao && (
          <>
            <Input
              label="Senha Inicial *"
              type="password"
              placeholder="Mínimo 8 dígitos (ex: Senha@123)"
              value={senha}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)}
              required
            />
            <div className="-mt-2 mb-3.5 text-[11px] text-slate-500">
              Requisitos: mínimo de 8 caracteres com letras maiúsculas, minúsculas, números e
              símbolo.
            </div>

            <Input
              label="Confirmar Senha Inicial *"
              type="password"
              placeholder="Digite a mesma senha"
              value={confirmarSenha}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmarSenha(e.target.value)}
              required
            />
          </>
        )}

        {isEdicao && (
          <div className="mb-4">
            <Select
              label="Status da Conta *"
              value={ativo ? 'true' : 'false'}
              disabled={isProprioUsuario}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setAtivo(e.target.value === 'true')}
            >
              <option value="true">Ativo (pode acessar o sistema)</option>
              <option value="false">Inativo (acesso bloqueado)</option>
            </Select>
          </div>
        )}

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">{isEdicao ? 'Salvar Alterações' : 'Cadastrar Usuário'}</Button>
        </div>
      </form>
    </Modal>
  );
}
