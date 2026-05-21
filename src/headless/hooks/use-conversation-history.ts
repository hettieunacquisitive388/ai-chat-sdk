"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatContext } from "../context/chat-provider";
import type { Session } from "../types/session";

export function useConversationHistory() {
  const { adapter } = useChatContext();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!adapter?.listSessions) return;
    setIsLoading(true);
    try {
      const result = await adapter.listSessions({ page: 1, limit: 50 });
      setSessions(result.sessions ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [adapter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!adapter?.deleteSession) return;
      await adapter.deleteSession(sessionId);
      await refresh();
    },
    [adapter, refresh],
  );

  return { sessions, isLoading, refresh, deleteSession };
}
