export interface RunGeneratorSchema {
  name: string;
  currentService: string;
  currentServiceType: string;

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
  defaultService?: string;
  seeds?: any[];
}
