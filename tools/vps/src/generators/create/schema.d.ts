export interface VpsSetupInfraSchema {
  infraName: string;        // Default: 'infra' (manejado por schema.json)
  baseDomain: string;       // Required
  acmeEmail: string;        // Required
  monitoring: boolean;      // Default: true (manejado por schema.json)
  grafanaSubdomain: string; // Default: 'grafana' (manejado por schema.json)
  traefikSubdomain: string; // Default: 'traefik' (manejado por schema.json)
  outputDirectory?: string; // Optional
}
