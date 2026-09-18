"use client";
import { Component, type ReactNode } from "react";

interface State { error: Error | null }

/** Catches any render crash in Growth Intelligence and shows the real error instead of a silent black screen. */
export class GrowthErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("growth.render_crashed", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#050505", color: "#f3ecec", padding: "48px 24px", fontFamily: "monospace" }}>
          <h1 style={{ color: "#e8798a", fontSize: 18, marginBottom: 12 }}>Something broke rendering this page</h1>
          <p style={{ color: "#8f8587", marginBottom: 16 }}>This is the real error — screenshot this and send it over:</p>
          <pre style={{ background: "#0c0708", border: "1px solid #241a1c", borderRadius: 8, padding: 16, whiteSpace: "pre-wrap", fontSize: 13, color: "#f3d9dd" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
