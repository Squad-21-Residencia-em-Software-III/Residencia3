import { ErrorLayout } from '../components/layout/ErrorLayout';

export default function ForbiddenPage() {
  return (
    <ErrorLayout
      code="403"
      signColor="#D97706"
      title="Acesso não autorizado"
      description="Esta área é de acesso restrito e requer credenciais com permissão especial. Retorne ao início para prosseguir."
      primaryAction={{
        label: 'Ir para o Início',
        to: '/inicio',
        icon: 'home',
      }}
      showBackButton={true}
    />
  );
}
