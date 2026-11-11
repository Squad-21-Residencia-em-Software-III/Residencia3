import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal } from '../../components/ui';
import type { Usuario } from '../../types/usuario';
import { mensagemDeErro } from '../../services/api/http';

interface ModalRedefinirSenhaProps {
  usuario: Usuario;
  onClose: () => void;
  onSalvar: (novaSenha: string) => Promise<void> | void;
}

function validarSenhaForte(senha: string): string | null {
  if (senha.length < 8) return 'A nova senha deve ter no mínimo 8 caracteres.';
  if (!/[A-Z]/.test(senha)) return 'A nova senha deve conter ao menos uma letra maiúscula.';
  if (!/[a-z]/.test(senha)) return 'A nova senha deve conter ao menos uma letra minúscula.';
  if (!/[0-9]/.test(senha)) return 'A nova senha deve conter ao menos um número.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(senha)) {
    return 'A nova senha deve conter ao menos um caractere especial (!@#$%...).';
  }
  return null;
}

export function ModalRedefinirSenha({ usuario, onClose, onSalvar }: ModalRedefinirSenhaProps) {
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const erroValidacao = validarSenhaForte(senha);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    if (senha !== confirmarSenha) {
      setErro('A confirmação não confere com a nova senha digitada.');
      return;
    }

    try {
      setSalvando(true);
      await onSalvar(senha);
      onClose();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal title="Redefinir Senha do Usuário" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[13px] font-semibold text-slate-900">{usuario.nome}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {usuario.email} • Perfil: {usuario.perfil}
          </div>
        </div>

        <Input
          label="Nova Senha *"
          type="password"
          placeholder="Mínimo 8 dígitos (ex: Senha@Nova123)"
          value={senha}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)}
          required
        />
        <div className="-mt-2 mb-3.5 text-[11px] text-slate-500">
          Requisitos: mínimo de 8 caracteres contendo maiúsculas, minúsculas, números e símbolos
          especiais.
        </div>

        <Input
          label="Confirmar Nova Senha *"
          type="password"
          placeholder="Repita a nova senha"
          value={confirmarSenha}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmarSenha(e.target.value)}
          required
        />

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Nova Senha'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
