import { ErrorLayout } from '../components/layout/ErrorLayout';

export default function NotFoundPage() {
  return (
    <ErrorLayout
      code="404"
      signColor="#DC2626"
      title="Página não encontrada"
      description="Esta página não está disponível no momento. Verifique o endereço digitado ou retorne ao início."
      primaryAction={{
        label: 'Ir para o Início',
        to: '/inicio',
        icon: 'home',
      }}
      showBackButton={true}
    />
  );
}
