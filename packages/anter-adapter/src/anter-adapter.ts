import type {
  ChatAdapter,
  ChatSessionFileRef,
  ListParams,
  MessagePayload,
  SessionConfig,
  SessionList,
  SessionPatch,
  UploadFileOptions,
} from "@anter/ai-chat-sdk/types";
import type { MessageSource } from "@anter/ai-chat-sdk/types";
import type { SessionWithMessages } from "@anter/ai-chat-sdk/types";
import { registerSlashCommand } from "@anter/ai-chat-sdk";

// Maps SDK contextId values → AskInfosec backend framework codes.
const CONTEXT_ID_TO_FRAMEWORK_CODE: Record<string, string> = {
  "soc2-type2": "soc2_type2",
  "soc2-type1": "soc2_type1",
  iso27001: "iso27001_2022",
  "iso27001-2013": "iso27001_2013",
  "nist-csf": "nist_csf_20",
  "pci-dss": "pci_dss_40",
  hipaa: "hipaa",
  fedramp: "fedramp",
  gdpr: "gdpr",
  ccpa: "ccpa",
  iso42001: "iso42001_2023",
  tsa: "tsa_cybersecurity",
};

interface AnterAdapterOptions {
  baseUrl: string;
  organizationId: string;
  projectId?: string;
  agentId?: string;
  userId?: string;
  getAuthHeaders: () => Promise<HeadersInit>;
}

export class AnterAdapter implements ChatAdapter {
  constructor(private readonly opts: AnterAdapterOptions) {}

  private get apiBase(): string {
    if (this.opts.projectId && this.opts.agentId) {
      return `/v1/external/projects/${this.opts.projectId}/agents/${this.opts.agentId}`;
    }
    return `/v1/organizations/${this.opts.organizationId}/agent-builder`;
  }

  private get memoryBase(): string {
    return `${this.apiBase}/memory/sessions`;
  }

  async createSession(_config: SessionConfig): Promise<string> {
    return crypto.randomUUID();
  }

  async loadSession(sessionId: string): Promise<SessionWithMessages> {
    const userSuffix = this.opts.userId ? `?userId=${encodeURIComponent(this.opts.userId)}` : "";
    const response = await this.request(`${this.memoryBase}/${sessionId}${userSuffix}`, "GET");
    const json = (await response.json()) as {
      sessionId: string;
      agentId: string;
      organizationId: string;
      createdAt: number;
      updatedAt: number;
      artifacts?: any[];
      turns: Array<{
        role: "user" | "assistant";
        content: string;
        ts: number;
        seq: number;
        meta?: {
          toolCalls?: Array<{ name: string; output: string | null }>;
          sources?: MessageSource[];
        };
      }>;
    };

    const firstUserMessage = json.turns.find((t) => t.role === "user")?.content?.trim();
    const title = firstUserMessage
      ? firstUserMessage.length > 40
        ? `${firstUserMessage.slice(0, 40)}...`
        : firstUserMessage
      : "Conversation";

    return {
      sessionId: json.sessionId,
      title: title as string,
      updatedAt: new Date(json.updatedAt).toISOString(),
      status: "active",
      artifacts: json.artifacts,
      messages: json.turns.map((t) => {
        let artifactIds: string[] | undefined;
        if (t.meta?.toolCalls) {
          t.meta.toolCalls.forEach((tc) => {
            if (tc.name === "generate_document" && tc.output) {
              try {
                const parsed = JSON.parse(tc.output);
                if (parsed.artifactId) {
                  artifactIds = artifactIds ?? [];
                  artifactIds.push(parsed.artifactId);
                }
              } catch {
                // Ignore parse errors from LLM output
              }
            }
          });
        }
        return {
          id: `msg_${json.sessionId}_${t.seq}`,
          role: t.role,
          content: t.content,
          timestamp: new Date(t.ts),
          artifactIds,
          sources: t.meta?.sources,
        };
      }),
    };
  }

  async listSessions(_params?: ListParams): Promise<SessionList> {
    const userSuffix = this.opts.userId ? `?userId=${encodeURIComponent(this.opts.userId)}` : "";
    const response = await this.request(`${this.memoryBase}${userSuffix}`, "GET");
    const json = (await response.json()) as Array<{
      sessionId: string;
      updatedAt: number;
      createdAt: number;
      title?: string;
    }>;

    return {
      sessions: json.map((s) => ({
        sessionId: s.sessionId,
        title: s.title || "Conversation",
        updatedAt: new Date(s.updatedAt).toISOString(),
        status: "active",
      })),
      total: json.length,
      page: 1,
    };
  }

  async updateSession(sessionId: string, patch: SessionPatch): Promise<void> {
    const userSuffix = this.opts.userId ? `?userId=${encodeURIComponent(this.opts.userId)}` : "";
    await this.request(`${this.memoryBase}/${sessionId}${userSuffix}`, "PATCH", patch);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const userSuffix = this.opts.userId ? `?userId=${encodeURIComponent(this.opts.userId)}` : "";
    await this.request(`${this.memoryBase}/${sessionId}${userSuffix}`, "DELETE");
  }

  async sendMessage(payload: MessagePayload): Promise<ReadableStream<Uint8Array>> {
    if (payload.message.toLowerCase() === "simulate artifact") {
      const encoder = new TextEncoder();
      return new ReadableStream({
        async start(controller) {
          const send = (event: string, data: any) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          };

          send("content", {
            content:
              "I have generated a simulated security policy for you. You can see it in the panel to the right.",
          });
          await new Promise((r) => setTimeout(r, 500));
          send("done", { isComplete: true, artifactIds: ["sim-artifact-001"] });
          controller.close();
        },
      });
    }

    // Map SDK contextId → backend frameworkId for backward compatibility.
    const { contextId, ...otherVars } = payload.contextVariables ?? {};
    const backendContextVars: Record<string, string> = { ...otherVars };
    if (contextId) {
      backendContextVars["frameworkId"] = contextId;
    }

    const response = await this.request(
      this.opts.projectId && this.opts.agentId
        ? `${this.apiBase}/run-stream`
        : `${this.apiBase}/run-anter`,
      "POST",
      {
        message: payload.message,
        sessionId: payload.sessionId,
        ...(payload.attachedFileIds?.length ? { attachedFileIds: payload.attachedFileIds } : {}),
        contextVariables: {
          ...backendContextVars,
          sessionId: payload.sessionId,
          ...(this.opts.userId ? { userId: this.opts.userId } : {}),
        },
      },
      {
        Accept: "text/event-stream",
      },
    );

    if (!response.body) {
      throw new Error("SSE response body is missing");
    }

    return response.body;
  }

  async uploadFile(
    sessionId: string,
    file: File,
    options?: UploadFileOptions,
  ): Promise<ChatSessionFileRef> {
    const authHeaders = await this.opts.getAuthHeaders();
    const form = new FormData();
    form.append("file", file);
    if (options?.parseAsQuestionnaire) {
      form.append("parseAsQuestionnaire", "true");
    }

    const response = await fetch(
      `${this.opts.baseUrl}/v1/organizations/${this.opts.organizationId}/agent-builder/sessions/${sessionId}/files`,
      {
        method: "POST",
        headers: authHeaders as HeadersInit,
        credentials: "include",
        body: form,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Upload failed (${response.status})`);
    }

    return response.json() as Promise<ChatSessionFileRef>;
  }

  async listSessionFiles(sessionId: string): Promise<ChatSessionFileRef[]> {
    const response = await this.request(
      `/v1/organizations/${this.opts.organizationId}/agent-builder/sessions/${sessionId}/files`,
      "GET",
    );
    const json = (await response.json()) as { files: ChatSessionFileRef[] };
    return json.files;
  }

  async deleteSessionFile(sessionId: string, fileId: string): Promise<void> {
    await this.request(
      `/v1/organizations/${this.opts.organizationId}/agent-builder/sessions/${sessionId}/files/${fileId}`,
      "DELETE",
    );
  }

  async loadSlashCommands(): Promise<void> {
    try {
      const headers = await this.opts.getAuthHeaders();
      const res = await fetch(
        `${this.opts.baseUrl}/v1/organizations/${this.opts.organizationId}/agent-builder/slash-commands`,
        { headers, credentials: "include" },
      );

      if (!res.ok) return;

      const commands = (await res.json()) as Array<{
        id: string;
        name: string;
        description: string;
        exampleUsage: string;
      }>;

      commands.forEach((cmd) => {
        registerSlashCommand({
          name: cmd.name,
          description: cmd.description,
          slashCommandId: cmd.id,
          exampleUsage: cmd.exampleUsage,
          onSelect: ({ setValue, submit }) => {
            setValue(cmd.name);
            submit(cmd.name);
          },
        });
      });
    } catch (error) {
      console.warn("Failed to load slash commands from API:", error);
    }
  }

  /** Check whether a GRC framework (by contextId) is active in the organization. */
  async checkFrameworkActive(
    organizationId: string,
    contextId: string,
  ): Promise<boolean | undefined> {
    const code = CONTEXT_ID_TO_FRAMEWORK_CODE[contextId];
    if (!code) return undefined;

    try {
      const authHeaders = await this.opts.getAuthHeaders();
      const url = `${this.opts.baseUrl}/v1/organizations/${organizationId}/frameworks?code=${code}&limit=1`;
      const res = await fetch(url, {
        headers: authHeaders as HeadersInit,
        credentials: "include",
      });

      if (!res.ok) return undefined;
      const data = (await res.json()) as { frameworks?: unknown[] };
      return Array.isArray(data.frameworks) && data.frameworks.length > 0;
    } catch {
      return undefined;
    }
  }

  private async request(
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    body?: unknown,
    extraHeaders?: HeadersInit,
  ): Promise<Response> {
    const authHeaders = await this.opts.getAuthHeaders();
    const response = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...extraHeaders,
      },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `${method} ${path} failed (${response.status})`);
    }

    return response;
  }
}

/**
 * @deprecated Use `AnterAdapter` instead. This alias will be removed in a future release.
 */
export const AskInfosecAdapter = AnterAdapter;
