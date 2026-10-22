import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

export const useToasts = create<{ toasts: Toast[] }>()(() => ({ toasts: [] }));

let nextId = 1;

export function toast(text: string, kind: Toast["kind"] = "info", ms = 4500): void {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function toastError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(e);
  toast(msg, "error", 8000);
}
