import { VpsCreateGeneratorSchema } from '../schema';

// Interfaz que representa las opciones después de la normalización inicial
export interface NormalizedOptions extends VpsCreateGeneratorSchema {
  projectName: string;      // Nombre del proyecto en Nx (ej: hostinger o servers-hostinger)
  projectRoot: string;      // Ruta relativa desde la raíz (ej: apps/hostinger)
  projectDirectory: string; // Alias para projectRoot
  vpsName: string;          // Nombre 'limpio' (ej: hostinger)
  parsedTags: string[];     // Array de tags procesados
  domainsList: string[];    // Array de dominios/subdominios
  primaryDomain: string;    // Primer dominio de la lista
  vpsNameUpper: string;     // Nombre en mayúsculas con guiones bajos (para secrets)
  monitoring?: boolean;
  // forceOverwrite?: boolean; // Ya está en VpsCreateGeneratorSchema
}
