"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, Plus, SlidersHorizontal } from "lucide-react";
import { useChatContext } from "../../headless/context/chat-provider";
import { SlashCommandMenu } from "./slash-command-menu";
import { ComposerPlusMenu } from "./composer-plus-menu";
import { ComposerToolsMenu } from "./composer-tools-menu";
import { ContextTagBar } from "./context-tag-bar";
import { AttachmentChipBar } from "./attachment-chip-bar";
import type { UploadingFile } from "./attachment-chip-bar";
import type { ChatSessionFileRef } from "../../headless/types/adapter";
import { getSlashCommandRegistry } from "../../extensions/slash-command-registry";
import { cn } from "../../lib/cn";

interface ChatComposerProps {
  onSendMessage: (
    message: string,
    attachedFileIds?: string[],
    sessionId?: string,
    extraContextVariables?: Record<string, string>,
  ) => void;
  isStreaming?: boolean;
  className?: string;
}

export function ChatComposer({ onSendMessage, isStreaming, className }: ChatComposerProps) {
  const {
    adapter,
    config,
    strings,
    plugins,
    currentSession,
    setCurrentSession,
    organizationId,
    activeContextId,
    activeContextLabel,
    setActiveContext,
    announcement,
    setAnnouncement,
  } = useChatContext();
  const { enableFileUpload } = config;
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [slashMenuItems, setSlashMenuItems] = useState<string[]>([]);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Array<ChatSessionFileRef | UploadingFile>>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (!selectedFiles.length || !adapter.uploadFile) return;

    e.target.value = "";

    let sessionId = currentSession?.sessionId;
    if (!sessionId) {
      sessionId = await adapter.createSession({
        organizationId,
        contextId: activeContextId,
      });
      setCurrentSession({
        sessionId,
        title: "New conversation",
        updatedAt: new Date().toISOString(),
        status: "active",
        contextId: activeContextId,
      });
    }
    const resolvedSessionId = sessionId;

    const now = Date.now();
    const placeholders: UploadingFile[] = selectedFiles.map((file, i) => ({
      id: `uploading-${now}-${i}-${file.name}`,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      status: "uploading",
      downloadUrl: "",
    }));
    setPendingFiles((prev) => [...prev, ...placeholders]);

    await Promise.allSettled(
      selectedFiles.map(async (file, i) => {
        const tempId = placeholders[i]!.id;
        try {
          const uploaded = await adapter.uploadFile!(resolvedSessionId, file);
          setPendingFiles((prev) => prev.map((f) => (f.id === tempId ? uploaded : f)));
        } catch {
          setPendingFiles((prev) => prev.filter((f) => f.id !== tempId));
        }
      }),
    );
  };

  const handleRemovePendingFile = async (fileId: string) => {
    const file = pendingFiles.find((f) => f.id === fileId);
    if (!file || !currentSession?.sessionId) return;

    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));

    if (file.status !== "uploading" && adapter.deleteSessionFile) {
      await adapter.deleteSessionFile(currentSession.sessionId, fileId).catch(() => {});
    }
  };

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const targetHeight = value ? Math.min(textarea.scrollHeight, 120) : 40;
    textarea.style.height = `${targetHeight}px`;
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showSlashMenu) {
      setActiveSlashIndex(0);
      if (slashMenuItems.length > 0) {
        setSlashMenuItems([]);
      }
      return;
    }

    setActiveSlashIndex((currentIndex) => {
      if (!slashMenuItems.length) {
        return 0;
      }

      return Math.min(currentIndex, slashMenuItems.length - 1);
    });
  }, [showSlashMenu, slashMenuItems]);

  const submit = (overrideValue?: string) => {
    const message = (overrideValue ?? value).trim();
    if (!message || isStreaming) return;

    const fileIds = pendingFiles.filter((f) => f.status !== "uploading").map((f) => f.id);

    onSendMessage(message, fileIds.length > 0 ? fileIds : undefined);
    setValue("");
    setShowSlashMenu(false);
    setPendingFiles([]);
  };

  const selectSlashCommand = (commandName: string) => {
    const command = getSlashCommandRegistry().find((c) => c.name === commandName);
    if (command) {
      command.onSelect({
        setValue,
        submit: (v?: string) => submit(v ?? commandName),
      });
    } else {
      setValue(commandName);
      setShowSlashMenu(false);
    }
  };

  const contextTag = activeContextLabel ?? activeContextId;

  return (
    <div className={cn("ais-composer", className)}>
      {contextTag && (
        <ContextTagBar tags={[contextTag]} onRemove={() => setActiveContext(undefined)} />
      )}

      {announcement && (
        <ContextTagBar
          layout="banner"
          announcement={{
            ...announcement,
            onDismiss: () => {
              if (announcement.onDismiss) {
                announcement.onDismiss();
              }
              setAnnouncement(null);
            },
          }}
        />
      )}

      <div className={cn("ais-composer-container", announcement && "has-banner")}>
        {enableFileUpload && pendingFiles.length > 0 && (
          <AttachmentChipBar files={pendingFiles} onRemove={handleRemovePendingFile} />
        )}
        {showSlashMenu ? (
          <SlashCommandMenu
            activeIndex={activeSlashIndex}
            onActiveIndexChange={setActiveSlashIndex}
            onClose={() => setShowSlashMenu(false)}
            onItemsChange={setSlashMenuItems}
            onSelect={selectSlashCommand}
            query={value.slice(1)}
          />
        ) : null}
        <textarea
          ref={textareaRef}
          className="ais-composer-input"
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            setActiveSlashIndex(0);
            setShowSlashMenu(config.enableSlashCommands && next.startsWith("/"));
          }}
          onCompositionEnd={() => setIsComposing(false)}
          onCompositionStart={() => setIsComposing(true)}
          onKeyDown={(event) => {
            if (showSlashMenu && event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setShowSlashMenu(false);
              return;
            }

            if (showSlashMenu && slashMenuItems.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveSlashIndex((currentIndex) => (currentIndex + 1) % slashMenuItems.length);
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveSlashIndex(
                  (currentIndex) =>
                    (currentIndex - 1 + slashMenuItems.length) % slashMenuItems.length,
                );
                return;
              }

              if (event.key === "Enter" && !event.shiftKey && !isComposing) {
                event.preventDefault();
                const selectedCommand = slashMenuItems[activeSlashIndex];
                if (selectedCommand) {
                  selectSlashCommand(selectedCommand);
                }
                return;
              }
            }

            if (event.key === "Enter" && !event.shiftKey && !isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={strings.composerPlaceholder}
          rows={1}
          value={value}
        />
        {enableFileUpload && showPlusMenu ? (
          <ComposerPlusMenu
            onClose={() => setShowPlusMenu(false)}
            onUploadFiles={() => fileInputRef.current?.click()}
          />
        ) : null}
        {showToolsMenu ? <ComposerToolsMenu onClose={() => setShowToolsMenu(false)} /> : null}
        {enableFileUpload && (
          <input
            accept="image/*,.pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md"
            multiple
            onChange={handleFilesSelected}
            ref={fileInputRef}
            style={{ display: "none" }}
            type="file"
          />
        )}
        <div className="ais-composer-footer">
          <div className="ais-composer-footer-left">
            {enableFileUpload && (
              <button
                aria-expanded={showPlusMenu}
                aria-haspopup="menu"
                aria-label="Add attachment"
                className="ais-composer-footer-btn ais-composer-footer-btn--circle"
                onClick={() => {
                  setShowToolsMenu(false);
                  setShowPlusMenu((v) => !v);
                }}
                type="button"
              >
                <Plus size={16} />
              </button>
            )}
            <button
              aria-expanded={showToolsMenu}
              aria-haspopup="menu"
              aria-label="Tools"
              className="ais-composer-footer-btn"
              onClick={() => {
                setShowPlusMenu(false);
                setShowToolsMenu((v) => !v);
              }}
              type="button"
            >
              <SlidersHorizontal size={14} />
              <span>Tools</span>
            </button>
            {plugins?.composerActions}
          </div>
          <div className="ais-composer-footer-right">
            <button
              className="ais-composer-footer-btn ais-composer-footer-btn--soon"
              type="button"
              aria-label="Voice input — coming soon"
              title="Voice input — coming soon"
              disabled
            >
              <Mic size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="ais-chat-footer">
        <p>{strings.footerDisclaimer}</p>
      </div>
    </div>
  );
}
