#!/bin/bash
set -e

# Configuration
IMAGE="gcr.io/mercurial-cairn-466220-b5/disp-time-backend:latest"
DEPLOYMENT="disp-time-backend"

echo "🚀 Starting deployment..."

# 1. Build
echo "📦 Building image (linux/amd64)..."
# We specify platform to ensure it runs on standard cloud servers, 
# preventing issues if you are building on an Apple Silicon Mac.
docker build --platform linux/amd64 -t "$IMAGE" -f backend/Dockerfile .

# 2. Push
echo "⬆️  Pushing image to registry..."
docker push "$IMAGE"

# 2.5. Update Secrets
echo "🔑 Updating Kubernetes secrets from backend/.env..."
if [ -f "backend/.env" ]; then
    # Extract values strictly to avoid issues with quoting or comments
    OWM_KEY=$(grep "^OPENWEATHER_API_KEY=" backend/.env | cut -d '=' -f2- | tr -d '\r')
    ADMIN_USER=$(grep "^ADMIN_USERNAME=" backend/.env | cut -d '=' -f2- | tr -d '\r')
    ADMIN_PASS=$(grep "^ADMIN_PASSWORD=" backend/.env | cut -d '=' -f2- | tr -d '\r')

    # Build the command dynamically
    CMD="kubectl create secret generic disp-time-secrets"
    FOUND_SECRET=false
    
    if [ ! -z "$OWM_KEY" ]; then 
        CMD="$CMD --from-literal=OPENWEATHER_API_KEY=$OWM_KEY"
        FOUND_SECRET=true
    fi
    if [ ! -z "$ADMIN_USER" ]; then 
        CMD="$CMD --from-literal=ADMIN_USERNAME=$ADMIN_USER"
        FOUND_SECRET=true
    fi
    if [ ! -z "$ADMIN_PASS" ]; then 
        CMD="$CMD --from-literal=ADMIN_PASSWORD=$ADMIN_PASS"
        FOUND_SECRET=true
    fi

    # Execute
    if [ "$FOUND_SECRET" = true ]; then
        eval $CMD --dry-run=client -o yaml | kubectl apply -f -
        echo "   Secrets updated."
    else
        echo "   No relevant secrets found in backend/.env."
    fi
else
    echo "   backend/.env not found. Skipping secret update."
fi

# 3. Apply Manifests
echo "📄 Applying Kubernetes manifests..."
# This ensures any changes to .yaml files in k8s/ are applied
kubectl apply -f k8s/

# 4. Restart Deployment
echo "🔄 Restarting '$DEPLOYMENT' to pick up the new image..."
kubectl rollout restart deployment/"$DEPLOYMENT"

echo "✅ Deployment pipeline finished successfully!"
