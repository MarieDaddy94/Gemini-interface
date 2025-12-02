import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "../services/logger";

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
    logger.error("Uncaught Client Error", { error, errorInfo });
  }

  private handleHardReset = () => {
    // Aggressive cleanup to fix corrupted state loops
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear all cookies
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {
      console.error("Failed to clear storage during reset", e);
    }
    
    // Force reload to root
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050509] p-4 font-sans">
          <div className="bg-[#1e222d] border border-red-900/50 rounded-lg shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-red-900/20 p-4 border-b border-red-900/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Critical System Error</h2>
                <p className="text-xs text-red-300">The application encountered an unrecoverable state.</p>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-black/40 rounded p-4 mb-6 border border-white/5 font-mono text-xs text-red-300 break-words whitespace-pre-wrap max-h-48 overflow-auto">
                {this.state.error?.message || "Unknown error occurred."}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-3 bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded font-bold shadow-lg shadow-blue-900/20 transition-colors"
                >
                  Attempt Reload
                </button>
                
                <button
                  onClick={this.handleHardReset}
                  className="w-full px-4 py-3 border border-red-900/30 hover:bg-red-900/20 text-red-400 rounded font-medium transition-colors text-sm"
                >
                  Factory Reset (Clear Data & Restart)
                </button>
                
                <p className="text-[10px] text-gray-500 text-center mt-2">
                  Use Factory Reset if the app crashes immediately after reloading. This will clear local settings.
                </p>
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