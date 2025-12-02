
import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "../services/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Uncaught Client Error", { error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#1e222d] border border-red-900/50 rounded-lg shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-red-900/20 p-4 border-b border-red-900/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white">Application Error</h2>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-300 mb-4">
                Something unexpected happened. We've logged this error for investigation.
                Please try reloading the application.
              </p>

              <div className="bg-black/40 rounded p-3 mb-6 border border-white/5 font-mono text-xs text-red-300 break-words whitespace-pre-wrap max-h-40 overflow-auto">
                {this.state.error?.message}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }}
                  className="px-4 py-2 border border-[#2a2e39] hover:bg-[#2a2e39] text-gray-400 hover:text-white rounded transition-colors text-xs font-medium"
                >
                  Clear Cache & Reload
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded transition-colors text-xs font-bold shadow-lg shadow-blue-500/20"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
