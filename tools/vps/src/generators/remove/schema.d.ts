export interface VpsRemoveGeneratorSchema {
  projectName: string; // Name of the project to remove
  forceRemove?: boolean; // Skip confirmation prompt
}
