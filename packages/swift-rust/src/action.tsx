import type * as React from "react";

export type ServerAction<TArgs extends unknown[] = unknown[], TReturn = unknown> = {
  (...args: TArgs): Promise<TReturn>;
  $$actionId: string;
};

interface BrowserEnv {
  window?: { location: { href: string } };
  FormData?: {
    new (form?: unknown): unknown;
  };
}

const env = globalThis as unknown as BrowserEnv;

export function createServerAction<T extends (...args: unknown[]) => unknown>(
  actionId: string,
  serverFn?: T,
): T & { $$actionId: string } {
  const action = (async (...args: unknown[]) => {
    const isBrowser = typeof env.window !== "undefined";
    if (!isBrowser && typeof serverFn === "function") {
      return (serverFn as (...a: unknown[]) => unknown)(...args);
    }
    const FormDataCtor = env.FormData;
    const isFormData =
      args.length === 1 &&
      typeof FormDataCtor === "function" &&
      args[0] instanceof (FormDataCtor as unknown as { new (): object });
    const headers: Record<string, string> = { "x-action-id": actionId };
    let body: string | unknown;
    if (isFormData) {
      body = args[0];
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(args);
    }
    const res = await fetch("/_swift-rust/action", {
      method: "POST",
      headers,
      body: body as string | FormData,
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as { error?: string; redirect?: string; data?: unknown };
      if (!res.ok || data?.error) {
        throw new Error(
          data?.error || `Server action ${actionId} failed with status ${res.status}`,
        );
      }
      if (data?.redirect && env.window) {
        env.window.location.href = data.redirect;
      }
      return data?.data !== undefined ? data.data : data;
    }
    if (!res.ok) {
      throw new Error(`Server action ${actionId} failed with status ${res.status}`);
    }
    return await res.text();
  }) as unknown as T & { $$actionId: string };

  action.$$actionId = actionId;
  return action;
}

export interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "action"> {
  action?: string | ServerAction | ((formData: unknown) => void | Promise<void>);
}

export function Form({ action, children, onSubmit, ...props }: FormProps): React.JSX.Element {
  const isServerAction = typeof action === "function" && "$$actionId" in action;
  const actionId = isServerAction ? (action as ServerAction).$$actionId : undefined;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof onSubmit === "function") {
      onSubmit(e);
      if (e.defaultPrevented) return;
    }
    if (typeof action === "function") {
      e.preventDefault();
      const FormDataCtor = env.FormData;
      const fd = FormDataCtor ? new FormDataCtor(e.currentTarget) : undefined;
      void Promise.resolve(action(fd)).catch((err) => {
        console.error("Form action error:", err);
      });
    }
  };

  return (
    <form
      {...props}
      action={
        isServerAction ? "/_swift-rust/action" : typeof action === "string" ? action : undefined
      }
      method={isServerAction ? "POST" : props.method || "POST"}
      onSubmit={handleSubmit}
    >
      {actionId ? <input type="hidden" name="__sr_action_id" value={actionId} /> : null}
      {children}
    </form>
  );
}
