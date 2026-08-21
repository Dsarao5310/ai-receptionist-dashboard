"use client";

import { create } from "zustand";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: "default" | "success" | "danger";
  action?: ToastAction;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id">, durationMs?: number) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION = 5000;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (toast, durationMs = DEFAULT_DURATION) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      get().dismiss(id);
    }, durationMs);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience helpers matching the shape call sites already use. */
export const toast = Object.assign(
  (title: string, opts?: { description?: string; action?: ToastAction }) =>
    useToastStore.getState().push({ title, description: opts?.description, action: opts?.action, tone: "default" }),
  {
    success: (title: string, opts?: { description?: string; action?: ToastAction }) =>
      useToastStore.getState().push({ title, description: opts?.description, action: opts?.action, tone: "success" }),
  }
);
