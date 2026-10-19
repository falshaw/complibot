#!/bin/bash
# =============================================================================
# CompliBot: Create least-privilege application role
# =============================================================================
# This script runs on first container init (docker-entrypoint-initdb.d).
# It creates a dedicated 'complibot' user with DML-only privileges.
# The postgres superuser remains for migrations, pgvector setup, and admin.
# =============================================================================

set -e

# Require a dedicated app password — fail loudly rather than reuse the superuser password
APP_PASSWORD="${COMPLIBOT_DB_PASSWORD:?COMPLIBOT_DB_PASSWORD required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create app-specific role with minimal privileges
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'complibot') THEN
            CREATE USER complibot WITH PASSWORD '${APP_PASSWORD}';
        END IF;
    END
    \$\$;

    -- Grant connection and schema access
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO complibot;
    GRANT USAGE ON SCHEMA public TO complibot;

    -- Grant DML-only access (no CREATE, DROP, ALTER, TRUNCATE)
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO complibot;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO complibot;

    -- Auto-grant on future tables/sequences created by migrations
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO complibot;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO complibot;
EOSQL

echo ">>> CompliBot app user 'complibot' created with least-privilege grants"
