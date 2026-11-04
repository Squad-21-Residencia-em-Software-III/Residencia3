import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import ServerErrorPage from '../pages/ServerErrorPage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Registra falhas inesperadas no console para auditoria
    console.error('ErrorBoundary capturou uma falha não tratada:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <ServerErrorPage onRetry={this.handleReset} />;
    }

    return this.props.children;
  }
}

