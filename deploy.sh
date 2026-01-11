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

# 3. Apply Manifests
echo "📄 Applying Kubernetes manifests..."
# This ensures any changes to .yaml files in k8s/ are applied
kubectl apply -f k8s/

# 4. Restart Deployment
echo "🔄 Restarting '$DEPLOYMENT' to pick up the new image..."
kubectl rollout restart deployment/"$DEPLOYMENT"

echo "✅ Deployment pipeline finished successfully!"
