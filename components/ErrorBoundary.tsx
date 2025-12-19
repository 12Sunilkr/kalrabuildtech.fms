
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";


interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// Fix: Inheriting from React.Component with explicit generic types to ensure proper access to this.props and this.state properties within the class instance
export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = { hasError: false };
  props: { children: any; };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    // Fix: Correctly accessing state and props from 'this' which refers to the current React Component instance
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-slate-100 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 to-orange-500"></div>
             
             <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 shadow-inner">
                <AlertTriangle size={48} />
             </div>
             
             <h1 className="text-3xl font-black text-slate-800 mb-2">System Error</h1>
             <p className="text-slate-500 mb-8 font-medium">
               The application encountered a critical issue. The interface has been suspended for security.
             </p>
             
             <div className="bg-slate-50 p-4 rounded-xl text-left mb-8 overflow-auto max-h-32 border border-slate-200 shadow-inner">
                 <div className="flex items-center gap-2 mb-2 text-red-600 font-bold text-xs uppercase tracking-wider">
                    <ShieldAlert size={14} /> Error Details
                 </div>
                 <p className="font-mono text-xs text-slate-600 break-words">
                   {error?.toString() || "Unknown Error"}
                 </p>
             </div>
             
             <button 
                onClick={() => window.location.reload()}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-slate-900/20"
             >
                <RefreshCw size={20} /> Reload Application
             </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
