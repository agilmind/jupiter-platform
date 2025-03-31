-- Inicialización de PostgreSQL para entorno local-prod

-- Habilitar extensiones útiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Configuraciones para rendimiento
ALTER SYSTEM SET max_connections = '100';
ALTER SYSTEM SET shared_buffers = '128MB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET effective_cache_size = '512MB';

-- Configuración de búsqueda
SET search_path TO public;

-- Comentario para verificar la ejecución
SELECT 'Configuración inicial de base de datos completada para local-prod' as "INFO";
