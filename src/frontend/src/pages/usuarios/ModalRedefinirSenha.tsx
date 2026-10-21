import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal } from '../../components/ui';
import type { Usuario } from '../../types/usuario';

interface ModalRedefinirSenhaProps {
  usuario: Usuario;
  onClose: () => void;
  onSalvar: (novaSenha: string) => void;
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

  const handleSubmit = (e: FormEvent) => {
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

    onSalvar(senha);
    onClose();
  };

  return (
    <Modal title="Redefinir Senha do Usuário" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>{erro}</p>
        )}

        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border)',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
            {usuario.nome}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
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
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            marginTop: '-8px',
            marginBottom: '14px',
          }}
        >
          Requisitos: mínimo de 8 caracteres contendo maiúsculas, minúsculas, números e símbolos especiais.
        </div>

        <Input
          label="Confirmar Nova Senha *"
          type="password"
          placeholder="Repita a nova senha"
          value={confirmarSenha}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmarSenha(e.target.value)}
          required
        />

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Salvar Nova Senha</Button>
        </div>
      </form>
    </Modal>
  );
}
