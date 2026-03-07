#!/bin/bash

# Sepolia Deployment Script
# Based on: https://book.dojoengine.org/tutorials/deploy-to-mainnet/main

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${GREEN}=== Sepolia Deployment ===${NC}"
echo -e "${BLUE}Contracts dir: $SCRIPT_DIR${NC}\n"

# Install tools via asdf if available
if command -v asdf &> /dev/null; then
    echo -e "${YELLOW}Installing tools via asdf...${NC}"
    asdf install
    echo -e "${GREEN}✓ asdf install complete${NC}\n"
else
    ASDF_INSTALL_LINK="https://asdf-vm.com/guide/getting-started.html"
    echo -e "${YELLOW}Note: asdf not found. Installation instructions here: $ASDF_INSTALL_LINK${NC}\n"
fi

# Navigate to contracts directory
cd "$SCRIPT_DIR"

# Load environment variables from the appropriate file
ENV_FILE=".env.sepolia"

if [ -f "$ENV_FILE" ]; then
  echo "Loading environment variables from $ENV_FILE..."
  export $(grep -v '^#' "$ENV_FILE" | xargs)
else
  echo "Environment file $ENV_FILE not found!"
  echo "Please create .env.sepolia with your RPC URL, account address, and private key."
  exit 1
fi

# Define a cleanup function to clear environment variables
cleanup_env() {
  echo "Cleaning up environment variables..."
  unset STARKNET_RPC_URL
  unset DOJO_ACCOUNT_ADDRESS
  unset DOJO_PRIVATE_KEY
  echo "Environment variables cleared."
}

# Set the trap to execute cleanup on script exit or error
trap cleanup_env EXIT

# Verify RPC is accessible
echo -e "${YELLOW}Verifying RPC connection...${NC}"
CHAIN_ID=$(curl -s --location "$STARKNET_RPC_URL" \
  --header 'Content-Type: application/json' \
  --data '{"id": 0,"jsonrpc": "2.0","method": "starknet_chainId","params": {}}' | \
  grep -o '"result":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CHAIN_ID" ]; then
  echo -e "${RED}Error: Could not connect to RPC provider${NC}"
  exit 1
fi

echo -e "${GREEN}Chain ID received: $CHAIN_ID${NC}"
DECODED=$(echo $CHAIN_ID | xxd -r -p 2>/dev/null || echo 'Could not decode')
echo -e "${GREEN}Decoded chain ID: $DECODED${NC}"

# Build the project
echo ""
echo -e "${YELLOW}Building the project for Sepolia...${NC}"
sozo -P sepolia build
echo -e "${GREEN}✓ Build complete${NC}"

# Deploy the project
echo ""
echo -e "${YELLOW}Deploying to Sepolia...${NC}"
echo ""
echo -e "${YELLOW}Note: Declaring many classes may take a while and can fail with 'Internal error'.${NC}"
echo "If deployment fails, try:"
echo "  1. Wait a few minutes and retry (network congestion)"
echo "  2. Check account has sufficient ETH (0.001+ recommended)"
echo "  3. Use: sozo -P sepolia migrate --skip-class-validation (if classes already declared)"
echo ""

# Try migration with retry logic
MAX_RETRIES=3
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
  if [ $RETRY_COUNT -gt 0 ]; then
    echo "Retry attempt $RETRY_COUNT of $MAX_RETRIES..."
    echo "Waiting 10 seconds before retry..."
    sleep 10
  fi

  if sozo -P sepolia migrate -vvv; then
    SUCCESS=true
    echo -e "${GREEN}✅ Migration succeeded!${NC}"
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo -e "${YELLOW}⚠️  Migration failed, will retry...${NC}"
    else
      echo ""
      echo -e "${RED}❌ Migration failed after $MAX_RETRIES attempts.${NC}"
      echo ""
      echo "Common solutions:"
      echo "1. Check account has sufficient ETH: https://starkscan.co/address/$DOJO_ACCOUNT_ADDRESS"
      echo "2. Wait a few minutes and try again (network congestion)"
      echo "3. If classes are already declared, try:"
      echo "   ./deploy_sepolia_skip_validation.sh"
      echo "4. Check RPC provider status"
      echo ""
      echo "You can also try manually:"
      echo "   sozo -P sepolia migrate --skip-class-validation"
      exit 1
    fi
  fi
done

# Get the world address from the manifest (if it exists)
echo ""
echo -e "${YELLOW}Extracting deployment information...${NC}"

# Check for sepolia manifest
SEPOLIA_MANIFEST="$SCRIPT_DIR/manifest_sepolia.json"
if [ -f "$SEPOLIA_MANIFEST" ]; then
    WORLD_ADDRESS=$(grep -o '"address": "0x[^"]*"' "$SEPOLIA_MANIFEST" | head -1 | cut -d'"' -f4)
    if [ ! -z "$WORLD_ADDRESS" ]; then
        echo -e "${GREEN}World deployed at: $WORLD_ADDRESS${NC}"
    fi
else
    echo -e "${YELLOW}Note: manifest_sepolia.json not found yet. It will be created after deployment.${NC}"
fi

# Copy updated manifest to client public directory (if it exists)
if [ -f "$SEPOLIA_MANIFEST" ] && [ -d "$SCRIPT_DIR/../client/public" ]; then
    cp "$SEPOLIA_MANIFEST" "$SCRIPT_DIR/../client/public/manifest_dev.json"
    echo -e "${GREEN}✓ Manifest copied to client/public/${NC}"
fi

# Deployment succeeded message
echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Copy the world_address from the output above"
echo "2. Add it to dojo_sepolia.toml: world_address = <world_address>"
echo "3. Add world_block = <block_number> to dojo_sepolia.toml"
echo "4. Deploy Torii indexer using:"
echo -e "   ${BLUE}slot deployments create <PROJECT_NAME> torii --version <DOJO_VERSION> --world <WORLD_ADDRESS> --rpc $STARKNET_RPC_URL${NC}"
echo ""
echo -e "${GREEN}=== Sepolia Deployment Complete ===${NC}"

