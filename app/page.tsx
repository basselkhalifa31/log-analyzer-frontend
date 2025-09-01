"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000"; // FastAPI URL

type Msg = { role: "user" | "assistant" | "system"; content: string };

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- Upload logs ----
  const handleUpload = async () => {
    setError(null);
    if (!file) return setError("Please choose a log file first.");

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.status !== "ok") {
        throw new Error(data.message || "Upload failed");
      }
      setChat((prev) => [
        ...prev,
        {
          role: "system",
          content: `✅ Uploaded log file (${data.lines} lines).`,
        },
      ]);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  // ---- Send message ----
  const handleSend = async () => {
    setError(null);
    const trimmed = message.trim();
    if (!trimmed) return;

    setChat((prev) => [...prev, { role: "user", content: trimmed }]);
    setMessage("");
    setChat((prev) => [...prev, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    const form = new FormData();
    form.append("message", trimmed);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantBuffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantBuffer += decoder.decode(value, { stream: true });

        setChat((prev) => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "assistant") {
              copy[i] = { ...copy[i], content: assistantBuffer };
              break;
            }
          }
          return copy;
        });
      }
    } catch (e: any) {
      setError(e.message || "Streaming failed");
      setChat((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "assistant") {
            copy[i] = {
              ...copy[i],
              content:
                copy[i].content || `⚠️ Failed to stream response: ${e.message}`,
            };
            break;
          }
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        height: "100vh",
      }}
    >
      {/* Sidebar - history */}
      <aside
        style={{
          borderRight: "1px solid #e5e7eb",
          padding: "16px",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontWeight: 700, marginBottom: 12 }}>History</h2>
        {chat
          .filter((m) => m.role === "user")
          .map((m, i) => (
            <div
              key={i}
              style={{
                padding: "8px",
                marginBottom: "8px",
                background: "#f9fafb",
                borderRadius: 6,
                fontSize: 14,
                cursor: "pointer",
              }}
              title={m.content}
            >
              {m.content.slice(0, 30)}...
            </div>
          ))}
      </aside>

      {/* Main area */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        }}
      >
        {/* File Upload Section */}
        <div
          style={{
            borderBottom: "1px solid #e5e7eb",
            padding: "16px",
            background: "white",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {/* Styled Choose File button */}
          <label
            style={{
              display: "inline-block",
              padding: "6px 12px",
              borderRadius: 6,
              background: "#9ca3af", // grey
              color: "white",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Choose File
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
          </label>

          {/* Show selected file name */}
          {file && (
            <span style={{ fontSize: 14, color: "#374151" }}>{file.name}</span>
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={isUploading}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: "#2563eb",
              color: "white",
            }}
          >
            {isUploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {/* Chat area */}
        <div
          style={{
            flexGrow: 1,
            overflowY: "auto",
            padding: "24px",
            display: "grid",
            gap: 12,
            background: "#fafafa",
          }}
        >
          {chat.length === 0 && (
            <div style={{ color: "#6b7280" }}>
              Tip: after uploading, try “Show me all errors”, “List warnings”,
              or “Suggest fixes for database issues”.
            </div>
          )}

          {chat.map((m, i) => (
            <div
              key={i}
              style={{
                padding: 12,
                borderRadius: 10,
                background: m.role === "user" ? "white" : "#f1f5f9",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 6,
                  fontWeight: 600,
                }}
              >
                {m.role === "user"
                  ? "You"
                  : m.role === "assistant"
                  ? "Agent"
                  : "System"}
              </div>
              <ReactMarkdown>{m.content || ""}</ReactMarkdown>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            padding: "16px",
            background: "white",
          }}
        >
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about the logs..."
            rows={3}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={handleSend}
              disabled={isStreaming}
              style={{
                padding: "8px 12px",
                background: "#16a34a",
                color: "white",
                borderRadius: 8,
                opacity: isStreaming ? 0.7 : 1,
              }}
            >
              {isStreaming ? "Streaming…" : "Send (Ctrl/⌘+Enter)"}
            </button>
            <button
              onClick={handleAbort}
              disabled={!isStreaming}
              style={{
                padding: "8px 12px",
                background: "#ef4444",
                color: "white",
                borderRadius: 8,
                opacity: !isStreaming ? 0.7 : 1,
              }}
            >
              Stop
            </button>
          </div>
          {error && (
            <div style={{ color: "#ef4444", fontSize: 14, marginTop: 8 }}>
              Error: {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
