import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <style>{`
            .error-boundary {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 2rem;
              background: #1a1a2e;
              color: #fff;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .error-boundary__icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            .error-boundary__title {
              font-size: 1.5rem;
              font-weight: 600;
              margin-bottom: 0.5rem;
              color: #ff6b6b;
            }
            .error-boundary__message {
              font-size: 0.875rem;
              color: #a0a0a0;
              margin-bottom: 1.5rem;
              max-width: 400px;
              text-align: center;
            }
            .error-boundary__details {
              background: rgba(255, 107, 107, 0.1);
              border: 1px solid rgba(255, 107, 107, 0.3);
              border-radius: 8px;
              padding: 1rem;
              margin-bottom: 1.5rem;
              max-width: 600px;
              width: 100%;
              overflow-x: auto;
            }
            .error-boundary__details pre {
              margin: 0;
              font-size: 0.75rem;
              color: #ff6b6b;
              white-space: pre-wrap;
              word-break: break-word;
            }
            .error-boundary__actions {
              display: flex;
              gap: 0.75rem;
            }
            .error-boundary__button {
              padding: 0.75rem 1.5rem;
              border: none;
              border-radius: 6px;
              font-size: 0.875rem;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
            }
            .error-boundary__button--primary {
              background: #4ecdc4;
              color: #1a1a2e;
            }
            .error-boundary__button--primary:hover {
              background: #3dbbb4;
            }
            .error-boundary__button--secondary {
              background: transparent;
              color: #a0a0a0;
              border: 1px solid #444;
            }
            .error-boundary__button--secondary:hover {
              border-color: #666;
              color: #fff;
            }
          `}</style>
          <div className="error-boundary__icon">⚠️</div>
          <h1 className="error-boundary__title">Something went wrong</h1>
          <p className="error-boundary__message">
            The application encountered an unexpected error. You can try to recover or reload the page.
          </p>
          {this.state.error && (
            <div className="error-boundary__details">
              <pre>{this.state.error.toString()}</pre>
            </div>
          )}
          <div className="error-boundary__actions">
            <button
              className="error-boundary__button error-boundary__button--primary"
              onClick={this.handleReset}
            >
              Try Again
            </button>
            <button
              className="error-boundary__button error-boundary__button--secondary"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
