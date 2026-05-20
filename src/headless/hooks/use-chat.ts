"use client";

import { createParser, type EventSourceMessage } from "eventsource-parser";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChatContext } from "../context/chat-provider";
import type {
  AgentPlanPhase,
  AgentStepEvent,
  ChatMessage,
  MessageSource,
  StreamingState,
} from "../types/chat";
import type { SessionWithMessages } from "../types/session";
import type { ChatAdapter } from "../types/adapter";
import type { Artifact } from "../types/artifact";
import { extractContent, extractError, resolveEventType } from "./stream-event-utils";
import { getSlashCommandRegistry } from "../../extensions/slash-command-registry";

import { extractArtifactsFromContent } from "../utils/artifact-utils";
import { extractCitationsFromContent } from "../utils/citation-utils";
import { extractRecordTagsFromContent, type RecordTag } from "../utils/record-utils";
import { extractSuggestionsFromContent } from "../utils/suggestion-utils";

function generateMessageId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `msg_${ts}_${rand}`;
}

function createUserMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    content,
    role: "user",
    timestamp: new Date(),
  };
}

function createAssistantMessage(): ChatMessage {
  return {
    id: generateMessageId(),
    content: "",
    role: "assistant",
    timestamp: new Date(),
    isStreaming: true,
    steps: [],
    startedAt: Date.now(),
  };
}

interface ParsedEvent {
  content?: string;
  isComplete?: boolean;
  error?: string;
  event?:
    | "step"
    | "plan"
    | "done"
    | "error"
    | "content"
    | "artifact"
    | "context_required"
    | "context_resolved"
    | string;
  type?: string;
  payload?: Record<string, unknown>;
  step?: AgentStepEvent;
  plan?: { phases: AgentPlanPhase[] };
  sources?: MessageSource[];
  artifactIds?: string[];
  suggestions?: string[];
  contextKey?: string;
  questionIntro?: string;
  choices?: Array<{ label: string; value: string }>;
  key?: string;
  value?: string;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  streamingState: StreamingState;
  isStreaming: boolean;
  isLoading: boolean;
  error?: string;
  currentSessionId?: string;
  currentSessionTitle?: string;
  adapter: ChatAdapter;
  sendMessage: (
    message: string,
    attachedFileIds?: string[],
    sessionId?: string,
    extraContextVariables?: Record<string, string>,
  ) => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  loadSession: (session: SessionWithMessages) => void;
}

const ChatStateContext = createContext<UseChatReturn | null>(null);

function useProvideChat(onArtifactsReady?: (artifacts: Artifact[]) => void): UseChatReturn {
  const {
    adapter,
    organizationId,
    currentSession,
    setCurrentSession,
    activeContextId,
    setActiveContext,
    persistentContextVariables,
  } = useChatContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const onArtifactsReadyRef = useRef(onArtifactsReady);
  onArtifactsReadyRef.current = onArtifactsReady;
  const accumContentRef = useRef("");
  const activeContextIdRef = useRef(activeContextId);
  activeContextIdRef.current = activeContextId;
  const persistentContextVariablesRef = useRef(persistentContextVariables);
  persistentContextVariablesRef.current = persistentContextVariables;

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setStreamingState({ isStreaming: false });
    setIsLoading(false);
    setCurrentSession(undefined);
    setActiveContext(undefined);
  }, [setCurrentSession, setActiveContext]);

  const sendMessage = useCallback(
    async (
      message: string,
      attachedFileIds?: string[],
      overrideSessionId?: string,
      extraContextVariables?: Record<string, string>,
    ) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      let sessionId = overrideSessionId ?? currentSession?.sessionId;
      if (!sessionId) {
        sessionId = await adapter.createSession({
          organizationId,
          contextId: activeContextIdRef.current,
        });
      }
      if (!currentSession?.sessionId) {
        setCurrentSession({
          sessionId,
          title: "New conversation",
          updatedAt: new Date().toISOString(),
          status: "active",
          contextId: activeContextIdRef.current,
        });
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const slashMatch = trimmed.match(/^(\/\w+)/);
      const matchedCommand = slashMatch
        ? getSlashCommandRegistry().find((c) => c.name === slashMatch[1])
        : undefined;

      if (matchedCommand?.slashCommandId === "help") {
        const commands = getSlashCommandRegistry();
        const helpContent = `### Available Commands\n\n| Command | Description | Example |\n| :--- | :--- | :--- |\n${commands
          .map((c) => `| **${c.name}** | ${c.description} | \`${c.exampleUsage || ""}\` |`)
          .join("\n")}\n\nType \`/\` in the chat box to see the command menu.`;

        const commandMessage: ChatMessage = {
          id: generateMessageId(),
          content: "/help",
          role: "command",
          timestamp: new Date(),
        };

        const helpAssistantMessage: ChatMessage = {
          ...createAssistantMessage(),
          content: helpContent,
          isStreaming: false,
        };

        setMessages((prev) => [...prev, commandMessage, helpAssistantMessage]);
        return;
      }

      const userMessage = createUserMessage(trimmed);
      const assistantMessage = createAssistantMessage();
      accumContentRef.current = "";

      const messagesToInsert: ChatMessage[] = matchedCommand
        ? [
            {
              id: generateMessageId(),
              content: matchedCommand.name,
              role: "command",
              timestamp: new Date(),
            },
            assistantMessage,
          ]
        : [userMessage, assistantMessage];

      setMessages((prev) => [...prev, ...messagesToInsert]);
      setStreamingState({
        isStreaming: true,
        currentMessageId: assistantMessage.id,
      });
      setIsLoading(true);

      try {
        const finalMessage =
          matchedCommand && trimmed === matchedCommand.name
            ? `Execute ${matchedCommand.name}`
            : trimmed;

        const stream = await adapter.sendMessage({
          organizationId,
          sessionId,
          message: finalMessage,
          ...(attachedFileIds?.length ? { attachedFileIds } : {}),
          contextVariables: {
            ...persistentContextVariablesRef.current,
            ...(activeContextIdRef.current ? { contextId: activeContextIdRef.current } : {}),
            ...(matchedCommand ? { slashCommand: matchedCommand.slashCommandId } : {}),
            ...extraContextVariables,
          },
        });

        const reader = stream.getReader();
        const decoder = new TextDecoder();

        const parser = createParser({
          onEvent(event: EventSourceMessage) {
            if (event.data === "[DONE]") {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id
                    ? {
                        ...msg,
                        isStreaming: false,
                        elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                      }
                    : msg,
                ),
              );
              setStreamingState({ isStreaming: false });
              setIsLoading(false);
              return;
            }

            let parsed: ParsedEvent;
            try {
              parsed = JSON.parse(event.data) as ParsedEvent;
            } catch {
              return;
            }

            const outerEventType = resolveEventType(event.event, parsed);

            if (outerEventType === "artifact" && parsed.payload) {
              onArtifactsReadyRef.current?.([parsed.payload as unknown as Artifact]);
            }

            // context_resolved: the server resolved a required context value.
            // Accept both "contextId" (new) and "frameworkId" (legacy backend compat).
            if (outerEventType === "context_resolved" && parsed.payload) {
              const { key, value } = parsed.payload as {
                key?: string;
                value?: string;
              };
              if ((key === "contextId" || key === "frameworkId") && typeof value === "string") {
                setActiveContext(value);
              }
            }

            const rawParsedContent = extractContent(parsed);
            if (rawParsedContent && outerEventType !== "artifact") {
              accumContentRef.current += rawParsedContent;
            }

            let frontendArtifacts: Artifact[] = [];
            const originalAccumContent = accumContentRef.current;
            let cleanedAccumContent = originalAccumContent;
            let frontendCitations: MessageSource[] = [];
            let frontendRecords: RecordTag[] = [];
            let frontendSuggestions: string[] = [];
            if (outerEventType === "done" || parsed.isComplete) {
              const extracted = extractArtifactsFromContent(
                originalAccumContent,
                assistantMessage.id,
              );
              if (extracted.artifacts.length > 0) {
                frontendArtifacts = extracted.artifacts;
                cleanedAccumContent = extracted.cleanedContent;
                onArtifactsReadyRef.current?.(frontendArtifacts);
              }

              const doneSources: MessageSource[] = Array.isArray(parsed.sources)
                ? (parsed.sources as MessageSource[])
                : Array.isArray(parsed.payload?.sources)
                  ? (parsed.payload.sources as MessageSource[])
                  : [];
              const citationResult = extractCitationsFromContent(cleanedAccumContent, doneSources);
              cleanedAccumContent = citationResult.cleanedContent;
              frontendCitations = citationResult.citations;

              const recordResult = extractRecordTagsFromContent(cleanedAccumContent);
              cleanedAccumContent = recordResult.cleanedContent;
              frontendRecords = recordResult.records;

              const suggestionsResult = extractSuggestionsFromContent(cleanedAccumContent);
              cleanedAccumContent = suggestionsResult.cleanedContent;
              frontendSuggestions = suggestionsResult.suggestions;
            } else {
              if (accumContentRef.current.includes("<record")) {
                const { cleanedContent } = extractRecordTagsFromContent(accumContentRef.current);
                cleanedAccumContent = cleanedContent;
              }
            }

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMessage.id) return msg;

                const eventType = resolveEventType(event.event, parsed);
                const parsedError = extractError(parsed);
                const parsedContent = extractContent(parsed);
                const payload = parsed.payload;
                const payloadSources = Array.isArray(payload?.sources)
                  ? (payload.sources as MessageSource[])
                  : undefined;
                const payloadArtifactIds = Array.isArray(payload?.artifactIds)
                  ? (payload.artifactIds as string[])
                  : undefined;
                const isComplete = Boolean(
                  parsed.isComplete || eventType === "done" || parsed.type === "complete",
                );

                if (eventType === "artifact" && payload) {
                  const artifact = payload as unknown as Artifact;
                  return {
                    ...msg,
                    artifactIds: [...(msg.artifactIds ?? []), artifact.artifactId],
                  };
                }

                if (eventType === "step" && parsed.step) {
                  const existing = msg.steps ?? [];
                  const idx = existing.findIndex((s) => s.step_id === parsed.step?.step_id);
                  const nextSteps =
                    idx >= 0
                      ? existing.map((s, i) => (i === idx ? { ...s, ...parsed.step } : s))
                      : [...existing, parsed.step];
                  return { ...msg, steps: nextSteps };
                }

                if (eventType === "plan" && parsed.plan) {
                  return { ...msg, plan: parsed.plan.phases };
                }

                if (eventType === "context_required" && parsed.contextKey && parsed.choices) {
                  return {
                    ...msg,
                    contextRequired: {
                      contextKey: parsed.contextKey,
                      questionIntro: parsed.questionIntro ?? "",
                      choices: parsed.choices,
                    },
                  };
                }

                if (eventType === "done" || parsed.isComplete) {
                  const backendArtifactIds =
                    parsed.artifactIds ?? payloadArtifactIds ?? msg.artifactIds;
                  const allArtifactIds = [
                    ...(backendArtifactIds ?? []),
                    ...frontendArtifacts.map((a) => a.artifactId),
                  ];
                  const contentWasModified = cleanedAccumContent !== originalAccumContent;
                  const hasClientSideChanges =
                    frontendArtifacts.length > 0 ||
                    frontendCitations.length > 0 ||
                    frontendRecords.length > 0 ||
                    contentWasModified;
                  const doneSuggestions: string[] = Array.isArray(parsed.suggestions)
                    ? (parsed.suggestions as unknown[]).filter(
                        (s): s is string => typeof s === "string",
                      )
                    : [];
                  const finalSuggestions =
                    doneSuggestions.length > 0 ? doneSuggestions : frontendSuggestions;
                  return {
                    ...msg,
                    content: hasClientSideChanges ? cleanedAccumContent : msg.content,
                    isStreaming: false,
                    artifactIds: allArtifactIds.length > 0 ? allArtifactIds : msg.artifactIds,
                    sources:
                      frontendCitations.length > 0
                        ? frontendCitations
                        : (parsed.sources ?? payloadSources ?? msg.sources),
                    records: frontendRecords.length > 0 ? frontendRecords : msg.records,
                    suggestions: finalSuggestions.length > 0 ? finalSuggestions : msg.suggestions,
                    elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                  };
                }

                if (eventType === "error" || parsedError) {
                  return {
                    ...msg,
                    isStreaming: false,
                    error: parsedError ?? "Unexpected stream error",
                    elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                  };
                }

                const nextContent = parsedContent ? `${msg.content}${parsedContent}` : msg.content;

                return {
                  ...msg,
                  content: nextContent,
                  sources: parsed.sources ?? payloadSources ?? msg.sources,
                  isStreaming: !isComplete,
                  elapsedMs:
                    isComplete && msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                };
              }),
            );

            const eventType = resolveEventType(event.event, parsed);
            if (eventType === "done" || eventType === "error" || parsed.isComplete) {
              setStreamingState({ isStreaming: false });
              setIsLoading(false);
            }
          },
          onError() {
            setStreamingState({
              isStreaming: false,
              error: "Failed to parse stream event",
            });
            setIsLoading(false);
          },
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }

        const tail = decoder.decode();
        if (tail) {
          parser.feed(tail);
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id && msg.isStreaming
              ? {
                  ...msg,
                  isStreaming: false,
                  elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                }
              : msg,
          ),
        );
        setStreamingState({ isStreaming: false });
        setIsLoading(false);

        reader.releaseLock();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setStreamingState({ isStreaming: false });
          setIsLoading(false);
          return;
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? {
                  ...msg,
                  isStreaming: false,
                  error: error instanceof Error ? error.message : "Unexpected error",
                }
              : msg,
          ),
        );

        setStreamingState({
          isStreaming: false,
          error: error instanceof Error ? error.message : "Unexpected error",
        });
        setIsLoading(false);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [adapter, currentSession?.sessionId, organizationId, setCurrentSession],
  );

  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current) return;

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.error) {
        return prev.slice(0, -1);
      }
      return prev;
    });

    await sendMessage(lastUserMessageRef.current);
  }, [sendMessage]);

  const loadSession = useCallback(
    (session: SessionWithMessages) => {
      abortControllerRef.current?.abort();
      setCurrentSession({
        sessionId: session.sessionId,
        title: session.title,
        updatedAt: session.updatedAt,
        status: session.status,
        contextId: session.contextId,
        model: session.model,
      });
      setActiveContext(session.contextId);

      const allExtractedArtifacts: Artifact[] = [];
      const cleanedMessages = session.messages.map((msg) => {
        if (msg.role !== "assistant" || !msg.content) {
          return { ...msg, timestamp: new Date(msg.timestamp) };
        }

        const { cleanedContent: afterArtifacts, artifacts } = extractArtifactsFromContent(
          msg.content,
          msg.id,
        );
        if (artifacts.length > 0) allExtractedArtifacts.push(...artifacts);

        const { cleanedContent: afterCitations, citations } = extractCitationsFromContent(
          afterArtifacts,
          msg.sources ?? [],
        );

        const { cleanedContent: afterRecords, records } =
          extractRecordTagsFromContent(afterCitations);

        const { cleanedContent } = extractSuggestionsFromContent(afterRecords);

        return {
          ...msg,
          content: cleanedContent,
          timestamp: new Date(msg.timestamp),
          sources: citations.length > 0 ? citations : msg.sources,
          records: records.length > 0 ? records : msg.records,
          ...(artifacts.length > 0
            ? {
                artifactIds: [...(msg.artifactIds ?? []), ...artifacts.map((a) => a.artifactId)],
              }
            : {}),
        };
      });

      setMessages(cleanedMessages);
      setStreamingState({ isStreaming: false });
      setIsLoading(false);

      if (allExtractedArtifacts.length > 0) {
        onArtifactsReadyRef.current?.(allExtractedArtifacts);
      }
      if (session.artifacts?.length) {
        onArtifactsReadyRef.current?.(session.artifacts);
      }
    },
    [setCurrentSession, setActiveContext],
  );

  return useMemo(
    () => ({
      messages,
      streamingState,
      isStreaming: streamingState.isStreaming,
      isLoading,
      error: streamingState.error,
      currentSessionId: currentSession?.sessionId,
      currentSessionTitle: currentSession?.title,
      adapter,
      sendMessage,
      clearMessages,
      retryLastMessage,
      loadSession,
    }),
    [
      messages,
      streamingState,
      isLoading,
      currentSession?.sessionId,
      currentSession?.title,
      adapter,
      sendMessage,
      clearMessages,
      retryLastMessage,
      loadSession,
    ],
  );
}

export function ChatStateProvider({
  children,
  onArtifactsReady,
}: {
  children: ReactNode;
  onArtifactsReady?: (artifacts: Artifact[]) => void;
}) {
  const chatState = useProvideChat(onArtifactsReady);
  return createElement(ChatStateContext.Provider, { value: chatState }, children);
}

export function useChat(): UseChatReturn {
  const context = useContext(ChatStateContext);
  return context ?? useProvideChat();
}
