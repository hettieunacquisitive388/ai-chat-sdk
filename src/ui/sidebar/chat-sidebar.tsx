"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
} from "lucide-react";
import { useChatContext } from "../../headless/context/chat-provider";
import { useConversationHistory } from "../../headless/hooks/use-conversation-history";
import { useChat } from "../../headless/hooks/use-chat";
import { RecentSessionItem } from "../shared/recent-session-item";
import { ConfirmDialog } from "../shared/confirm-dialog";

export type ChatView = "chat" | "recents";

interface ChatSidebarProps {
  onNewConversation?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
  activeView?: ChatView;
  onViewChange?: (view: ChatView) => void;
  /** When this transitions from false → true (artifact panel just opened),
   *  the sidebar is automatically collapsed. The user can still re-open it
   *  afterwards — this is a one-time nudge, not a permanent lock. REQ-02/04 */
  artifactPanelOpen?: boolean;
}

export function ChatSidebar({
  onNewConversation,
  isOpen,
  onToggle,
  className,
  activeView = "chat",
  onViewChange,
  artifactPanelOpen,
}: ChatSidebarProps) {
  const { adapter, organizationId, currentSession, setCurrentSession } = useChatContext();
  const { sessions, isLoading, refresh, deleteSession } = useConversationHistory();
  const { loadSession, currentSessionId, isStreaming, clearMessages } = useChat();
  const [collapsed, setCollapsed] = useState(false);
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const isStreamingRef = React.useRef(isStreaming);
  const prevArtifactOpenRef = React.useRef<boolean | undefined>(undefined);

  // REQ-02: auto-collapse the sidebar the moment the artifact panel opens,
  // but allow the user to re-expand it afterwards (edge-trigger, not a lock).
  useEffect(() => {
    if (artifactPanelOpen && !prevArtifactOpenRef.current) {
      setCollapsed(true);
    }
    prevArtifactOpenRef.current = artifactPanelOpen;
  }, [artifactPanelOpen]);

  const handleDeleteSession = (sessionId: string) => {
    setSessionToDelete(sessionId);
  };

  const confirmDelete = async () => {
    if (sessionToDelete) {
      await deleteSession(sessionToDelete);
      if (sessionToDelete === currentSessionId) {
        if (onNewConversation) {
          onNewConversation();
        } else {
          clearMessages();
        }
      }
      setSessionToDelete(null);
    }
  };

  // Refresh sessions when a new chat's first response completes
  useEffect(() => {
    if (isStreamingRef.current && !isStreaming) {
      const isKnownSession = sessions.some((s) => s.sessionId === currentSessionId);
      if (!isKnownSession && currentSessionId) {
        void refresh();
      }
    }
    isStreamingRef.current = isStreaming;
  }, [isStreaming, sessions, currentSessionId, refresh]);

  // Sync current session title with the history list if it changed (e.g. after auto-naming)
  useEffect(() => {
    if (!currentSessionId || !currentSession || isStreaming) return;

    const matchingSession = sessions.find((s) => s.sessionId === currentSessionId);
    if (matchingSession && matchingSession.title !== currentSession.title) {
      setCurrentSession({
        ...currentSession,
        title: matchingSession.title,
      });
    }
  }, [sessions, currentSessionId, currentSession, setCurrentSession, isStreaming]);

  useEffect(() => {
    const persisted = window.localStorage.getItem("ais-sidebar-collapsed");
    if (persisted === "1") {
      setCollapsed(true);
      return;
    }
    if (persisted === "0") {
      setCollapsed(false);
      return;
    }

    // Auto-collapse on smaller screens on mount
    if (window.innerWidth < 1024) {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ais-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const topNavItems = useMemo(
    () => [
      {
        id: "new-chat",
        label: "New Chat",
        icon: Plus,
        action: () => {
          onNewConversation?.();
          onViewChange?.("chat");
        },
      },
      {
        id: "search",
        label: "Search",
        icon: Search,
        action: () => {
          window.dispatchEvent(new CustomEvent("ais-open-command-palette"));
        },
      },
      {
        id: "recents",
        label: "Chats",
        icon: MessageCircle,
        active: activeView === "recents",
        action: () => onViewChange?.("recents"),
      },
      {
        id: "back-to-dashboard",
        label: "Platform",
        icon: LayoutDashboard,
        action: () => {
          window.location.href = `/${organizationId}`;
        },
      },
    ],
    [onNewConversation, onViewChange, activeView, organizationId],
  );

  function renderRailButton(item: (typeof topNavItems)[number]) {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`ais-sidebar-nav-item ${item.active ? "is-active" : ""} ${collapsed ? "is-collapsed" : ""}`}
        onClick={() => {
          item.action?.();
          if (isOpen && onToggle) onToggle(); // Close sidebar on mobile after action
        }}
        type="button"
        title={item.label}
        aria-label={item.label}
      >
        <Icon size={18} strokeWidth={1.9} />
        <span className="ais-sidebar-nav-label">{item.label}</span>
        {item.id === "search" && !collapsed && <span className="ais-sidebar-nav-shortcut">⌘K</span>}
      </button>
    );
  }

  return (
    <aside
      className={`ais-sidebar ${collapsed ? "is-collapsed" : ""} ${isOpen ? "is-mobile-open" : ""} ${className ?? ""}`}
    >
      <div className="ais-sidebar-header">
        <div className="ais-sidebar-brand">
          <div className="ais-sidebar-brand-title">anter</div>
        </div>

        <button
          className="ais-sidebar-toggle"
          onClick={() => {
            if (window.innerWidth < 768 && onToggle) {
              onToggle();
            } else {
              setCollapsed((prev) => !prev);
            }
          }}
          type="button"
          aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
          title={collapsed ? "Open sidebar" : "Close sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className={`ais-sidebar-nav-list ${collapsed ? "is-collapsed" : ""}`}>
        {topNavItems.map((item) => renderRailButton(item))}
      </div>

      {(!collapsed || isOpen) && (
        <div
          className={`ais-sidebar-content-area ${recentsCollapsed ? "is-recents-collapsed" : ""}`}
        >
          <div className="ais-sidebar-section-header">
            <div className="ais-sidebar-section-label">Recents</div>
            <button
              className="ais-sidebar-section-toggle"
              onClick={() => setRecentsCollapsed((prev) => !prev)}
              type="button"
            >
              {recentsCollapsed ? "Show" : "Hide"}
            </button>
          </div>
          <div className="ais-sidebar-recents" role="list" aria-label="Recent conversations">
            {isLoading ? <p className="ais-sidebar-hint">Loading...</p> : null}
            {!isLoading && sessions.length === 0 ? (
              <p className="ais-sidebar-hint">No conversations yet</p>
            ) : null}
            {sessions.map((session) => (
              <RecentSessionItem
                key={session.sessionId}
                session={session}
                isActive={session.sessionId === currentSessionId}
                onClick={async () => {
                  try {
                    const full = await adapter.loadSession(session.sessionId);
                    loadSession(full);
                    if (isOpen && onToggle) onToggle();
                  } catch {
                    // Session no longer exists on the backend — refresh the
                    // list and fall back to an empty new-chat state.
                    void refresh();
                    clearMessages();
                    onNewConversation?.();
                  }
                }}
                onDelete={handleDeleteSession}
                formatDate={(d) => d} // Sidebar variant doesn't use formatDate currently
                variant="sidebar"
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!sessionToDelete}
        onOpenChange={(open) => !open && setSessionToDelete(null)}
        title="Delete conversation"
        description="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        isDanger
      />
    </aside>
  );
}
