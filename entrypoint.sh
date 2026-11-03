#!/bin/sh
set -e

if [ -z "$SESSION_SECRET" ] || [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "ERROR: SESSION_SECRET is missing or shorter than 32 characters." >&2
  echo "Set it in your .env before starting the container (see .env.example)." >&2
  exit 1
fi

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting app..."
exec "$@"
