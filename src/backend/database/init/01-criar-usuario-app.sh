#!/bin/sh
set -e

if [ -z "$POSTGRES_APP_USER" ] || [ -z "$POSTGRES_APP_PASSWORD" ]; then
  echo "POSTGRES_APP_USER ou POSTGRES_APP_PASSWORD nao definidos; pulando criacao automatica da role de aplicacao."
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$POSTGRES_APP_USER" \
  -v app_password="$POSTGRES_APP_PASSWORD" \
  -v db_name="$POSTGRES_DB" <<-'EOSQL'
  SELECT format(
    'CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'app_user',
    :'app_password'
  )
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

  SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'app_user',
    :'app_password'
  ) \gexec

  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  SELECT format('REVOKE CREATE ON SCHEMA public FROM %I', :'app_user') \gexec
  SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'app_user') \gexec
  SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user') \gexec

  SELECT format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    :'app_user'
  ) \gexec

  SELECT format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
    :'app_user'
  ) \gexec
EOSQL
