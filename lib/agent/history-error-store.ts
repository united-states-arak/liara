"use client";

import { create } from "zustand";

type HistoryErrorState = {
  error: string | null;
  setError: (error: string | null) => void;
};

export const useHistoryErrorStore = create<HistoryErrorState>()((set) => ({
  error: null,
  setError: (error) => set({ error }),
}));
