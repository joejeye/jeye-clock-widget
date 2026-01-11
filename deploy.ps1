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

# 2.5. Update Secrets
Write-Host "🔑 Updating Kubernetes secrets from backend/.env..." -ForegroundColor Yellow
if (Test-Path "backend/.env") {
    $EnvContent = Get-Content "backend/.env"
    $EnvVars = @{}
    foreach ($Line in $EnvContent) {
        if ($Line -match "^(OPENWEATHER_API_KEY|ADMIN_USERNAME|ADMIN_PASSWORD)=(.*)$") {
            $EnvVars[$Matches[1]] = $Matches[2].Trim()
        }
    }

    if ($EnvVars.Count -gt 0) {
        $SecretCmd = "kubectl create secret generic disp-time-secrets"
        foreach ($Key in $EnvVars.Keys) {
            $SecretCmd += " --from-literal=$Key=$($EnvVars[$Key])"
        }
        $SecretCmd += " --dry-run=client -o yaml | kubectl apply -f -"
        Invoke-Expression $SecretCmd
        Write-Host "   Secrets updated." -ForegroundColor Gray
    } else {
        Write-Host "   No relevant secrets found in backend/.env." -ForegroundColor Gray
    }
} else {
    Write-Host "   backend/.env not found. Skipping secret update." -ForegroundColor Red
}

# 3. Apply Manifests
Write-Host "📄 Applying Kubernetes manifests..." -ForegroundColor Yellow
kubectl apply -f k8s/

# 4. Restart Deployment
Write-Host "🔄 Restarting '$Deployment' to pick up the new image..." -ForegroundColor Yellow
kubectl rollout restart deployment/$Deployment

Write-Host "✅ Deployment pipeline finished successfully!" -ForegroundColor Green
