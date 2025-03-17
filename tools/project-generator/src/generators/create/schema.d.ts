export interface ProjectGeneratorSchema {
    projectName: string;
    documentationLanguage: DocumentationLanguage; // Assuming you will create an enum for this
    tags?: string;
}

export enum DocumentationLanguage {
  English = 'en',
  Spanish = 'es'
}
