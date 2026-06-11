#!/usr/bin/env bash
# Khởi động Claude Tree: backend API (:4799) + frontend Vite (:5174)
cd "$(dirname "$0")"
PORT=4799 node server/index.js & B=$!
(cd web && npm run dev) & F=$!
trap "kill $B $F 2>/dev/null" EXIT
echo "▶ Backend :4799  ·  Frontend http://localhost:5174"
wait
