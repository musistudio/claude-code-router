export type SidebarThread = {
  active?: boolean;
  age?: string;
  id: string;
  providerId?: string;
  providerSessionId?: string;
  title: string;
  updatedAt?: number;
  working?: boolean;
};

export type SidebarProject = {
  id: string;
  name: string;
  path?: string;
  removable?: boolean;
  threads: SidebarThread[];
};

export function getSidebarProjectLabel(project: SidebarProject): string {
  return project.name || "Repositories";
}

export function hasSidebarThread(projects: SidebarProject[], threadId: string): boolean {
  return projects.some((project) => project.threads.some((thread) => thread.id === threadId));
}
