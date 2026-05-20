"use client";

import React, { useState, useCallback } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { FileText, X, FileDown, Share2, Copy, Check, Code2, AlignLeft } from "lucide-react";
import type { UseArtifactsReturn } from "../../headless/hooks/use-artifacts";
import { useChatContext } from "../../headless/context/chat-provider";
import { ArtifactPreview } from "./artifact-preview";

const TYPE_META: Record<string, { label: string; color: string }> = {
  markdown: { label: "Markdown", color: "#2563EB" },
  html: { label: "HTML", color: "#0891B2" },
  code: { label: "Code", color: "#7C3AED" },
  table: { label: "Data Table", color: "#059669" },
  docx: { label: "Word Document", color: "#1D6F42" },
};

const TABS_BY_TYPE: Record<
  string,
  Array<{
    value: "preview" | "source" | "export";
    label: string;
    icon: React.ReactNode;
  }>
> = {
  markdown: [
    { value: "preview", label: "Preview", icon: <AlignLeft size={13} /> },
    { value: "source", label: "Markdown", icon: <Code2 size={13} /> },
    { value: "export", label: "Export", icon: <FileDown size={13} /> },
  ],
  html: [
    { value: "preview", label: "Preview", icon: <AlignLeft size={13} /> },
    { value: "source", label: "HTML", icon: <Code2 size={13} /> },
    { value: "export", label: "Export", icon: <FileDown size={13} /> },
  ],
  code: [
    { value: "preview", label: "Code", icon: <Code2 size={13} /> },
    { value: "export", label: "Export", icon: <FileDown size={13} /> },
  ],
  table: [
    { value: "preview", label: "Preview", icon: <AlignLeft size={13} /> },
    { value: "export", label: "Export", icon: <FileDown size={13} /> },
  ],
  docx: [
    { value: "preview", label: "Preview", icon: <AlignLeft size={13} /> },
    { value: "export", label: "Export", icon: <FileDown size={13} /> },
  ],
};

interface ArtifactPanelProps {
  artifactsCtx: UseArtifactsReturn;
  /** Optional callback to save the artifact to an external system. When provided, an export button is shown. */
  onExportArtifact?: (artifactId: string) => Promise<void>;
  className?: string;
}

export function ArtifactPanel({ artifactsCtx, onExportArtifact, className }: ArtifactPanelProps) {
  const { strings } = useChatContext();
  const { activeArtifact, panelState, closePanel, setActiveTab } = artifactsCtx;
  const [copied, setCopied] = useState(false);

  const handleCopySource = useCallback(() => {
    if (!activeArtifact) return;
    void navigator.clipboard.writeText(activeArtifact.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [activeArtifact]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!activeArtifact) return;
    try {
      const blob = new Blob([activeArtifact.content], {
        type: "text/markdown",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeArtifact.title}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Markdown export failed:", err);
    }
  }, [activeArtifact]);

  if (!panelState.isOpen || !activeArtifact) return null;

  const hasPreview = Boolean(
    (activeArtifact.previewContent && activeArtifact.previewContent.trim()) ||
    (activeArtifact.content && activeArtifact.content.trim()),
  );
  const tabsByType = (TABS_BY_TYPE[activeArtifact.type] ?? TABS_BY_TYPE.markdown)!;
  const tabs =
    activeArtifact.type === "docx" && !hasPreview
      ? tabsByType.filter((tab) => tab.value !== "preview")
      : tabsByType;
  const meta = TYPE_META[activeArtifact.type] ?? {
    label: activeArtifact.type.toUpperCase(),
    color: "#64748B",
  };

  const previewText = activeArtifact.previewContent ?? activeArtifact.content ?? "";
  const wordCount = previewText
    .replace(/[#*`_\-[\]()]/g, "")
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <aside className={`ais-artifact-panel ais-animate-artifact-panel-in ${className ?? ""}`}>
      <div className="ais-ap-accent-bar" />

      <header className="ais-ap-header">
        <div className="ais-ap-header-icon">
          <FileText size={15} />
        </div>
        <div className="ais-ap-header-body">
          <div className="ais-ap-meta-row">
            <span
              className="ais-ap-type-badge"
              style={{ "--ap-type-color": meta.color } as React.CSSProperties}
            >
              {meta.label}
            </span>
            <span className="ais-ap-word-count">{wordCount.toLocaleString()} words</span>
          </div>
          <h3 className="ais-ap-title">{activeArtifact.title}</h3>
        </div>
        <button
          aria-label="Close artifact panel"
          className="ais-ap-close"
          onClick={closePanel}
          type="button"
        >
          <X size={15} />
        </button>
      </header>

      <Tabs.Root
        className="ais-ap-tabs-root"
        onValueChange={(v) => setActiveTab(v as "preview" | "source" | "export")}
        value={panelState.activeTab}
      >
        <Tabs.List className="ais-ap-tab-list">
          {tabs.map((tab) => (
            <Tabs.Trigger className="ais-ap-tab" key={tab.value} value={tab.value}>
              {tab.icon}
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content className="ais-ap-tab-content ais-ap-preview" value="preview">
          <div className="ais-ap-prose">
            <ArtifactPreview artifact={activeArtifact} />
          </div>
        </Tabs.Content>

        <Tabs.Content className="ais-ap-tab-content ais-ap-source" value="source">
          <div className="ais-ap-source-toolbar">
            <span className="ais-ap-source-lang">{meta.label}</span>
            <button
              className={`ais-ap-copy-btn ${copied ? "is-copied" : ""}`}
              onClick={handleCopySource}
              type="button"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="ais-ap-source-pre">{activeArtifact.content}</pre>
        </Tabs.Content>

        <Tabs.Content className="ais-ap-tab-content ais-ap-export" value="export">
          <div className="ais-ap-export-body">
            <div className="ais-ap-export-section-label">Download</div>
            <div className="ais-ap-export-options">
              {activeArtifact.downloadUrl && (
                <a
                  className="ais-ap-export-btn ais-ap-export-btn--docx"
                  href={activeArtifact.downloadUrl}
                  download={`${activeArtifact.title}.docx`}
                  rel="noopener noreferrer"
                >
                  <span className="ais-ap-export-btn-icon">
                    <FileDown size={18} />
                  </span>
                  <span className="ais-ap-export-btn-label">
                    <span className="ais-ap-export-btn-title">Word document</span>
                    <span className="ais-ap-export-btn-sub">Formatted DOCX, ready for sharing</span>
                  </span>
                  <span className="ais-ap-export-ext">.docx</span>
                </a>
              )}
              {activeArtifact.exportFormats.includes("markdown") && (
                <button
                  className="ais-ap-export-btn ais-ap-export-btn--md"
                  onClick={handleDownloadMarkdown}
                  type="button"
                >
                  <span className="ais-ap-export-btn-icon">
                    <FileDown size={18} />
                  </span>
                  <span className="ais-ap-export-btn-label">
                    <span className="ais-ap-export-btn-title">Markdown file</span>
                    <span className="ais-ap-export-btn-sub">
                      Plain text, universally compatible
                    </span>
                  </span>
                  <span className="ais-ap-export-ext">.md</span>
                </button>
              )}

              {onExportArtifact && (
                <button
                  className="ais-ap-export-btn ais-ap-export-btn--save"
                  onClick={() => void onExportArtifact(activeArtifact.artifactId)}
                  type="button"
                >
                  <span className="ais-ap-export-btn-icon">
                    <Share2 size={18} />
                  </span>
                  <span className="ais-ap-export-btn-label">
                    <span className="ais-ap-export-btn-title">{strings.exportArtifact}</span>
                    {strings.exportArtifactSub && (
                      <span className="ais-ap-export-btn-sub">{strings.exportArtifactSub}</span>
                    )}
                  </span>
                </button>
              )}
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
