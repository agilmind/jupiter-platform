-- Configuración inicial de la base de datos
-- Este script se ejecutará cuando el contenedor de PostgreSQL inicie por primera vez

-- Habilitar extensiones útiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Establecer configuraciones de rendimiento
ALTER SYSTEM SET max_connections = '100';
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET effective_cache_size = '1GB';

-- Configuración de búsqueda
SET search_path TO public;

-- Comentario para verificar la ejecución
SELECT 'Configuración inicial de base de datos completada' as "INFO";
