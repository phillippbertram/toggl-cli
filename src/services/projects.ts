import type {TogglApiClient} from '../api.js';
import {TglError} from '../errors.js';
import type {Project} from '../models.js';

export const activeProjects = async (
  client: TogglApiClient,
  workspaceId: number,
): Promise<Project[]> => {
  const projects = await client.getProjects();
  return projects
    .filter(
      (project) =>
        (project.workspace_id ?? project.wid) === workspaceId &&
        project.active &&
        project.can_track_time,
    )
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const findProject = (projects: Project[], input: string): Project[] => {
  const numericId = Number(input);
  if (Number.isSafeInteger(numericId)) {
    return projects.filter((project) => project.id === numericId);
  }

  const normalized = input.trim().toLocaleLowerCase();
  const exact = projects.filter(
    (project) => project.name.toLocaleLowerCase() === normalized,
  );
  if (exact.length > 0) {
    return exact;
  }

  return projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(normalized),
  );
};

export const requireProject = (
  projects: Project[],
  projectId: number,
): Project => {
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new TglError(
      `Project ${projectId} is archived or unavailable in the configured workspace.`,
      2,
    );
  }
  return project;
};
