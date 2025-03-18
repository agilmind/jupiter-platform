export interface RunGeneratorSchema {
  name: string;
  // Para compatibilidad con el código existente (servicio único)
  currentService?: string;
  currentServiceType?: string;
  haikuDir?: string;

  selectedServices?: string[]; // Nombres de los servicios seleccionados

  // Propiedades del hkconfig.json
  systemOwner?: string;
  sources?: string[];
  site?: string;
  serverIP?: string;
  adminEmail?: string;
  superAdminEmail?: string;
  title?: Record<string, string>;
  languages?: Record<string, string>;
  timeZones?: Record<string, Record<string, string>>;
  timeFormats?: Record<string, string>;
  multiTenancy?: boolean;
  services?: Record<string, string>;
  defaultServices?: string[];
  seeds?: any[];
}
