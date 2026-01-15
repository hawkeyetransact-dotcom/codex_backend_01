#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="/workspaces"
BACKEND_REPO="codex_backend_01"
FRONTEND_REPO="codex_frontend_01"

if [ -d "${WORKSPACE_ROOT}/${FRONTEND_REPO}/.git" ]; then
  echo "Frontend repo already present."
else
  echo "Cloning frontend repo..."
  git clone https://github.com/hawkeyetransact-dotcom/codex_frontend_01.git "${WORKSPACE_ROOT}/${FRONTEND_REPO}"
fi

if [ "${SKIP_INSTALL:-false}" != "true" ]; then
  echo "Installing backend dependencies..."
  (cd "${WORKSPACE_ROOT}/${BACKEND_REPO}" && npm install)
  if [ -d "${WORKSPACE_ROOT}/${FRONTEND_REPO}" ]; then
    echo "Installing frontend dependencies..."
    (cd "${WORKSPACE_ROOT}/${FRONTEND_REPO}" && npm install)
  fi
else
  echo "SKIP_INSTALL=true; skipping npm install."
fi
