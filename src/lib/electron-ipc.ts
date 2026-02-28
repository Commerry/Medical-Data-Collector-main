export const ipc = {
  ping: () => {
    if (typeof window === "undefined") {
      return "pong";
    }

    const api = (window as Window & { mdc?: { ping: () => string } }).mdc;
    return api?.ping?.() ?? "pong";
  },
  invoke: <T>(channel: string, payload?: unknown) => {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("IPC unavailable"));
    }

    const api =
      (window as Window & { mdc?: { invoke?: (c: string, p?: unknown) => Promise<T> } }).mdc;

    if (!api?.invoke) {
      return Promise.reject(new Error("IPC not initialized"));
    }

    return api.invoke(channel, payload) as Promise<T>;
  },
  on: <T = unknown>(channel: string, listener: (data: T) => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const api =
      (window as Window & { mdc?: { on?: (c: string, l: (...args: unknown[]) => void) => () => void } }).mdc;

    if (!api?.on) {
      return () => undefined;
    }

    return api.on(channel, (data) => listener(data as T));
  }
};
