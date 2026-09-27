export interface CreateProjectStructureInput {
  projectPath: string;
  projectName: string;
}

export interface ProjectScaffolder {
  create(input: CreateProjectStructureInput): Promise<void>;
}
