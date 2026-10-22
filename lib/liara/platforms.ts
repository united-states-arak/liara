export const PLATFORMS = [
  "node",
  "next",
  "react",
  "vue",
  "angular",
  "static",
  "python",
  "django",
  "flask",
  "php",
  "laravel",
  "go",
  "dotnet",
  "docker",
] as const;

export type Platform = (typeof PLATFORMS)[number];
