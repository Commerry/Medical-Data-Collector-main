interface Window {
  mdc?: {
    ping: () => string;
    invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<T>;
    on: <T = unknown>(channel: string, listener: (data: T) => void) => () => void;
  };
}
