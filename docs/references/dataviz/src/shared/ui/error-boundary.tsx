'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4 animate-fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              Algo deu errado
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ocorreu um erro ao carregar esta seção. Tente recarregar a página.
            </p>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
