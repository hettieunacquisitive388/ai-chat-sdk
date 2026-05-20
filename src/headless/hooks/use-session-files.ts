"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatContext } from "../context/chat-provider";
import type { ChatSessionFileRef } from "../types/adapter";

export interface UseSessionFilesReturn {
  files: ChatSessionFileRef[];
  isLoading: boolean;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  refresh: () => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
}

export function useSessionFiles(): UseSessionFilesReturn {
  const { adapter, currentSession } = useChatContext();
  const [files, setFiles] = useState<ChatSessionFileRef[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const sessionId = currentSession?.sessionId;

  const refresh = useCallback(async () => {
    if (!sessionId || !adapter.listSessionFiles) return;
    setIsLoading(true);
    try {
      const result = await adapter.listSessionFiles(sessionId);
      setFiles(result);
    } catch {
      // Non-fatal — panel shows empty state
    } finally {
      setIsLoading(false);
    }
  }, [adapter, sessionId]);

  // Single effect covers both cases: session change AND panel open.
  // Having two separate effects caused a double fetch when sessionId changed while panelOpen was true.
  useEffect(() => {
    if (sessionId) void refresh();
  }, [panelOpen, sessionId, refresh]);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!sessionId || !adapter.deleteSessionFile) return;
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      await adapter.deleteSessionFile(sessionId, fileId).catch(() => {
        // Re-fetch to restore accurate state on failure
        void refresh();
      });
    },
    [adapter, sessionId, refresh],
  );

  return {
    files,
    isLoading,
    panelOpen,
    openPanel,
    closePanel,
    refresh,
    deleteFile,
  };
}
