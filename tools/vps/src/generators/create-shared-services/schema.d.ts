export interface VpsCreateSharedServicesSchema {
  projectName: string;
  includePostgres?: boolean; // Default true
  includeRabbitMQ?: boolean; // Default true
  postgresPassword?: string; // Required if includePostgres is true
  rabbitPassword?: string; // Required if includeRabbitMQ is true
  directory?: string;
  tags?: string;
}
