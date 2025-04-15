export interface VpsRemoveInfraSchema {
  projectName: string; // Nombre del proyecto Nx a eliminar (ej: 'infra')
  forceRemove?: boolean; // Opción para forzar, alias 'force'
}
