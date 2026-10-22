import { requestJson } from "@/components/settings/settings-api";

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
};

export const FOLDERS_QUERY_KEY = ["folders"] as const;

export function fetchFolders() {
  return requestJson<{ folders: Folder[] }>("/api/folders");
}

export function createFolder(name: string) {
  return requestJson<{ folder: Folder }>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameFolder(id: string, name: string) {
  return requestJson<{ folder: Folder }>(`/api/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteFolder(id: string) {
  return requestJson<void>(`/api/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
}
