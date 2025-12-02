import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#131722] text-gray-300 p-8 font-sans">
          <div className="bg-[#1e222d] border border-red-900/30 rounded-lg p-8 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
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
              <h1 className="text-xl font-bold text-white">System Malfunction</h1>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-gray-400">
              The AI Trading Interface encountered a critical error and had to shut down the current view to protect data integrity.
            </p>

            <div className="bg-black/40 rounded p-3 mb-6 border border-white/5 font-mono text-xs text-red-300 break-words whitespace-pre-wrap">
              {this.state.error?.message}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium py-2 rounded transition-colors text-sm"
              >
                Reboot System
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="px-4 py-2 border border-[#2a2e39] hover:bg-[#2a2e39] text-gray-400 hover:text-white rounded transition-colors text-sm"
              >
                Clear Cache & Restart
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;