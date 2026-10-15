export type ChatExchange = Readonly<{ prompt: string; response: string }>;

// A one-use browser-memory handoff. Never put message text in URLs or browser storage.
let pending: ChatExchange | null = null;
export function attachExchange(exchange: ChatExchange) {
  pending = Object.freeze({ ...exchange });
}
export function takeExchange(): ChatExchange | null {
  const exchange = pending;
  pending = null;
  return exchange;
}
export function clearExchange() {
  pending = null;
}
