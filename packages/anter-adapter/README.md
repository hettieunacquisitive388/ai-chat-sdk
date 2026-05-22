# `@anter/anter-adapter`

The official [Anter](https://askinfosec.tech) backend adapter for [`@anter/ai-chat-sdk`](../ai-chat-sdk).

This package is a concrete implementation of the `ChatAdapter` interface that connects the SDK to the AskInfosec / Anter backend API. It lives as a sibling package so that `@anter/ai-chat-sdk` remains a truly generic, domain-agnostic SDK.

---

## Installation

This package is consumed as a monorepo workspace package. From any workspace app:

```bash
pnpm add @anter/anter-adapter
```

It declares `@anter/ai-chat-sdk` as a **peer dependency** — install both in the consuming app:

```bash
pnpm add @anter/ai-chat-sdk @anter/anter-adapter
```

---

## Usage

```typescript
import { AnterAdapter } from "@anter/anter-adapter";
import { ChatProvider, ChatShell } from "@anter/ai-chat-sdk";
import "@anter/ai-chat-sdk/styles.css";

const adapter = new AnterAdapter({
  baseUrl: "/api/chat",
  organizationId: "org-123",
  getAuthHeaders: async () => ({
    Authorization: `Bearer ${await getToken()}`,
  }),
});

export function App() {
  return (
    <ChatProvider organizationId="org-123" adapter={adapter}>
      <ChatShell />
    </ChatProvider>
  );
}
```

---

## Constructor options

| Option           | Type                         | Required | Description                                                                                                       |
| ---------------- | ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `baseUrl`        | `string`                     | Yes      | Base URL for all API requests (e.g. `"/api/chat"` for Next.js route proxying, or `"/api"` for direct API proxies) |
| `organizationId` | `string`                     | Yes      | Tenant identifier                                                                                                 |
| `projectId`      | `string`                     | No       | Targets a specific Agent Builder project                                                                          |
| `agentId`        | `string`                     | No       | Pairs with `projectId` to target a specific agent                                                                 |
| `userId`         | `string`                     | No       | Optional user identifier forwarded on every request                                                               |
| `getAuthHeaders` | `() => Promise<HeadersInit>` | Yes      | Returns auth headers for every request                                                                            |

> [!IMPORTANT]
> **Understanding the `baseUrl` path prefix:**
> The adapter appends the standard backend routes directly to `baseUrl` (e.g., `${baseUrl}/v1/organizations/...`).
>
> - **Next.js Route Handlers** — set `baseUrl: "/api/chat"` (the handler strips the prefix when proxying to the backend).
> - **Direct API proxy** (Vite proxy, Nginx rewrite) — set `baseUrl: "/api"`. Using `"/api/chat"` here will cause the proxy to forward `/chat/v1/...` to the backend and return `404`.

---

## Wiring `getAuthHeaders` to your auth provider

`getAuthHeaders` is called before every API request. The recommended pattern is a module-level setter/getter so the adapter can reach the host app's token without importing auth libraries directly:

```typescript
// lib/api-token.ts
let tokenProvider: (() => Promise<string | null>) | null = null;

export function setApiTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn;
}

export function getApiToken(): Promise<string | null> {
  return tokenProvider ? tokenProvider().catch(() => null) : Promise.resolve(null);
}
```

```typescript
// auth/provider.tsx — call this once when auth initialises
import { setApiTokenProvider } from "../lib/api-token";

// MSAL (Azure AD)
setApiTokenProvider(() => acquireAccessToken(msalInstance, account));

// Supabase
setApiTokenProvider(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});
```

```typescript
// chat/adapter.ts
import { AnterAdapter } from "@anter/anter-adapter";
import { getApiToken } from "../lib/api-token";

export const adapter = new AnterAdapter({
  baseUrl: "/api/chat",
  organizationId: "org-123",
  getAuthHeaders: async () => {
    const token = await getApiToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
```

---

## Routing

- When both `projectId` and `agentId` are set, API calls go to `/v1/external/projects/{projectId}/agents/{agentId}`.
- Without them, calls go to `/v1/organizations/{organizationId}/agent-builder`.

---

## Additional methods (Anter-specific)

These extend `ChatAdapter` and are not part of the generic interface:

- **`checkFrameworkActive(organizationId, contextId)`** — checks whether a GRC framework is active for the given org. Returns `boolean | undefined` (undefined on network error or unknown `contextId`).
- **`loadSlashCommands()`** — fetches slash commands from the Anter API and registers them in the global slash command registry.

---

## Backward-compatibility mapping

The adapter transparently maps the SDK's generic `contextId` context variable to the Anter backend's legacy `frameworkId` field before sending each message. This is opaque to the SDK layer and does not affect other adapters.

---

## Naming

The class is exported as `AnterAdapter`. The old name `AskInfosecAdapter` is re-exported as a deprecated alias for backward compatibility and will be removed in a future major version.

```typescript
// Preferred
import { AnterAdapter } from "@anter/anter-adapter";

// Deprecated — still works, emits a JSDoc deprecation warning in IDEs
import { AskInfosecAdapter } from "@anter/anter-adapter";
```
