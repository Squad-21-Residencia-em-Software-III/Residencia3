import { ErrorLayout } from '../components/layout/ErrorLayout';

export default function ServerErrorPage({ onRetry }: { onRetry?: () => void }) {
  const handleReload = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <ErrorLayout
      code="500"
      signColor="#DC2626"
      title="Instabilidade no servidor"
      description="Esta página está temporariamente indisponível. Por favor, tente novamente mais tarde."
      primaryAction={{
        label: 'Tentar novamente',
        onClick: handleReload,
        icon: 'refresh',
      }}
      showBackButton={true}
    />
  );
}
