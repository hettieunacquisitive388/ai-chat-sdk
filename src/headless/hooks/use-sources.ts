"use client";

import { useCallback, useMemo, useState } from "react";
import type { MessageSource } from "../types/chat";

export interface SourcesPanelState {
  isOpen: boolean;
  scrollToIndex?: number;
}

export interface UseSourcesReturn {
  activeSources: MessageSource[];
  activeMessageId?: string;
  panelState: SourcesPanelState;
  openSources: (messageId: string, sources: MessageSource[], scrollToIndex?: number) => void;
  closeSources: () => void;
}

export function useSources(): UseSourcesReturn {
  const [activeMessageId, setActiveMessageId] = useState<string | undefined>();
  const [activeSources, setActiveSources] = useState<MessageSource[]>([]);
  const [panelState, setPanelState] = useState<SourcesPanelState>({
    isOpen: false,
  });

  const openSources = useCallback(
    (messageId: string, sources: MessageSource[], scrollToIndex?: number) => {
      setActiveMessageId(messageId);
      setActiveSources(sources);
      setPanelState({ isOpen: true, scrollToIndex });
    },
    [],
  );

  const closeSources = useCallback(() => {
    setPanelState({ isOpen: false });
  }, []);

  return useMemo(
    () => ({
      activeSources,
      activeMessageId,
      panelState,
      openSources,
      closeSources,
    }),
    [activeSources, activeMessageId, panelState, openSources, closeSources],
  );
}
