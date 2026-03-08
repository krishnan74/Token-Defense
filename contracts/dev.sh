#!/bin/bash

# Token Defense — Local Development Environment
# Starts Katana, builds/migrates contracts, and starts Torii
# All services shut down on script exit
#
# Toolchain (see .tool-versions):
#   scarb  2.16.0
#   sozo   1.8.6
#   katana 1.7.1
#   torii  1.8.7

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Store PIDs for cleanup
KATANA_PID=""
TORII_PID=""

# Cleanup function to kill all services
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"

    if [ -n "$TORII_PID" ] && kill -0 "$TORII_PID" 2>/dev/null; then
        echo -e "${BLUE}Stopping Torii (PID: $TORII_PID)...${NC}"
        kill "$TORII_PID" 2>/dev/null || true
        wait "$TORII_PID" 2>/dev/null || true
    fi

    if [ -n "$KATANA_PID" ] && kill -0 "$KATANA_PID" 2>/dev/null; then
        echo -e "${BLUE}Stopping Katana (PID: $KATANA_PID)...${NC}"
        kill "$KATANA_PID" 2>/dev/null || true
        wait "$KATANA_PID" 2>/dev/null || true
    fi

    echo -e "${GREEN}All services stopped${NC}"
    exit 0
}

# Set up trap to call cleanup on script exit
trap cleanup SIGINT SIGTERM EXIT

# Get script directory (contracts/)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${GREEN}=== Token Defense — Local Dev Environment ===${NC}"
echo -e "${BLUE}Contracts dir: $SCRIPT_DIR${NC}\n"

# Install tools via asdf if available
if command -v asdf &> /dev/null; then
    echo -e "${YELLOW}Installing tools via asdf...${NC}"
    cd "$SCRIPT_DIR" && asdf install
    echo -e "${GREEN}✓ Tools ready${NC}\n"
else
    echo -e "${YELLOW}Warning: asdf not found. Ensure scarb/sozo/katana/torii are on PATH.${NC}"
    echo -e "${YELLOW}  Install asdf: https://asdf-vm.com/guide/getting-started.html${NC}\n"
fi

# Navigate to contracts directory
cd "$SCRIPT_DIR"

# ─── Step 1: Start Katana ────────────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Starting Katana (katana.toml)...${NC}"
katana --config katana.toml > /tmp/td-katana.log 2>&1 &
KATANA_PID=$!
echo -e "${BLUE}Katana PID: $KATANA_PID${NC}"

echo -e "${YELLOW}Waiting for Katana RPC on :5050...${NC}"
for i in {1..30}; do
    if curl -sf http://localhost:5050 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Katana ready${NC}"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo -e "${RED}Error: Katana failed to start. Check /tmp/td-katana.log${NC}"
        cat /tmp/td-katana.log
        exit 1
    fi
    sleep 1
done

# ─── Step 2: Build contracts ─────────────────────────────────────────────────
echo -e "\n${YELLOW}[2/4] Building contracts (scarb build)...${NC}"
# IMPORTANT: must build before sozo migrate or sozo won't detect changes
scarb build
echo -e "${GREEN}✓ Build complete${NC}"

# ─── Step 3: Migrate / deploy ────────────────────────────────────────────────
echo -e "\n${YELLOW}[3/4] Migrating world (sozo migrate --profile dev)...${NC}"
sozo migrate --profile dev
echo -e "${GREEN}✓ Migration complete${NC}"

# Extract world address from manifest
WORLD_ADDRESS=$(python3 -c "import json,sys; d=json.load(open('manifest_dev.json')); print(d['world']['address'])" 2>/dev/null \
    || grep -o '"address": "0x[^"]*"' manifest_dev.json | head -1 | cut -d'"' -f4)
echo -e "${GREEN}World address: $WORLD_ADDRESS${NC}"

# ─── Step 4: Start Torii ─────────────────────────────────────────────────────
echo -e "\n${YELLOW}[4/4] Starting Torii indexer...${NC}"
torii \
    --world "$WORLD_ADDRESS" \
    --rpc http://localhost:5050 \
    --http.cors_origins "*" \
    > /tmp/td-torii.log 2>&1 &
TORII_PID=$!
echo -e "${BLUE}Torii PID: $TORII_PID${NC}"

echo -e "${YELLOW}Waiting for Torii on :8080...${NC}"
for i in {1..20}; do
    if curl -sf http://localhost:8080/graphql > /dev/null 2>&1 || \
       curl -sf http://localhost:8080 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Torii ready${NC}"
        break
    fi
    if [ "$i" -eq 20 ]; then
        # Non-fatal — Torii sometimes takes longer; just warn
        echo -e "${YELLOW}Torii may still be starting up — check /tmp/td-torii.log${NC}"
        break
    fi
    sleep 1
done

# ─── Ready ───────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Token Defense — Dev Stack Ready    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo -e ""
echo -e "  ${BLUE}Katana RPC${NC}     http://localhost:5050"
echo -e "  ${BLUE}Torii GraphQL${NC}  http://localhost:8080/graphql"
echo -e "  ${BLUE}Torii gRPC${NC}     localhost:8081"
echo -e ""
echo -e "  ${BLUE}World${NC}          $WORLD_ADDRESS"
echo -e ""
echo -e "  ${BLUE}Logs${NC}           /tmp/td-katana.log"
echo -e "               /tmp/td-torii.log"
echo -e ""
echo -e "  ${YELLOW}Next:${NC} cd ../client && pnpm run dev"
echo -e ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# ─── Monitor ─────────────────────────────────────────────────────────────────
while true; do
    if ! kill -0 "$KATANA_PID" 2>/dev/null; then
        echo -e "${RED}Error: Katana process died — check /tmp/td-katana.log${NC}"
        exit 1
    fi
    if ! kill -0 "$TORII_PID" 2>/dev/null; then
        echo -e "${RED}Error: Torii process died — check /tmp/td-torii.log${NC}"
        exit 1
    fi
    sleep 5
done
