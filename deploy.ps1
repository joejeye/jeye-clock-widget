$ErrorActionPreference = "Stop"

# Configuration
$Image = "gcr.io/mercurial-cairn-466220-b5/disp-time-backend:latest"
$Deployment = "disp-time-backend"

Write-Host "🚀 Starting deployment..." -ForegroundColor Cyan

# 1. Build
Write-Host "📦 Building image (linux/amd64)..." -ForegroundColor Yellow
# We specify platform to ensure it runs on standard cloud servers
docker build --platform linux/amd64 -t $Image -f backend/Dockerfile .

# 2. Push
Write-Host "⬆️  Pushing image to registry..." -ForegroundColor Yellow
docker push $Image

# 3. Apply Manifests
Write-Host "📄 Applying Kubernetes manifests..." -ForegroundColor Yellow
kubectl apply -f k8s/

# 4. Restart Deployment
Write-Host "🔄 Restarting '$Deployment' to pick up the new image..." -ForegroundColor Yellow
kubectl rollout restart deployment/$Deployment

Write-Host "✅ Deployment pipeline finished successfully!" -ForegroundColor Green
