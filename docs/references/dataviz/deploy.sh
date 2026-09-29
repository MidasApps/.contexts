#!/usr/bin/env bash
# deploy.sh — Deploy DataViz to Cloud Run
#
# Usage:
#   ./deploy.sh                              # Uses defaults
#   ./deploy.sh --service my-app             # Custom service name
#   ./deploy.sh --region us-east1            # Custom region
#   ./deploy.sh --project my-gcp-project     # Custom project
#   ./deploy.sh --tag v1.2.3                 # Custom image tag
#   ./deploy.sh --database dataviz-staging   # Firestore database (default: dataviz)
#
# Prerequisites:
#   - gcloud CLI authenticated (`gcloud auth login`)
#   - Docker installed and running
#   - Artifact Registry repository created
#   - Secrets stored in Secret Manager

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────
SERVICE_NAME="dataviz"
REGION="us-central1"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
TAG="latest"
# Banco Firestore que o app lê (DATAVIZ_DATABASE_ID no servidor,
# NEXT_PUBLIC_DATAVIZ_DATABASE_ID no bundle). O mesmo valor vai para os dois:
# servidor e navegador não podem apontar para bancos diferentes.
DATABASE_ID="dataviz"

# ── Parse arguments ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --service)  SERVICE_NAME="$2"; shift 2 ;;
    --region)   REGION="$2"; shift 2 ;;
    --project)  PROJECT_ID="$2"; shift 2 ;;
    --tag)      TAG="$2"; shift 2 ;;
    --database) DATABASE_ID="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--service NAME] [--region REGION] [--project PROJECT] [--tag TAG] [--database DATABASE_ID]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No GCP project set. Use --project or run 'gcloud config set project PROJECT_ID'"
  exit 1
fi

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/dataviz"
IMAGE="${REGISTRY}/${SERVICE_NAME}:${TAG}"

echo "============================================"
echo "  DataViz — Cloud Run Deploy"
echo "============================================"
echo "  Project:  ${PROJECT_ID}"
echo "  Service:  ${SERVICE_NAME}"
echo "  Region:   ${REGION}"
echo "  Image:    ${IMAGE}"
echo "  Database: ${DATABASE_ID}"
echo "============================================"
echo ""

# ── Step 1: Ensure Artifact Registry repo exists ─────────────
echo "[1/4] Ensuring Artifact Registry repository exists..."
gcloud artifacts repositories describe dataviz \
  --location="${REGION}" \
  --project="${PROJECT_ID}" &>/dev/null || \
gcloud artifacts repositories create dataviz \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --description="DataViz container images"

# ── Step 2: Configure Docker for Artifact Registry ───────────
echo "[2/4] Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── Step 3: Build and push image ────────────────────────────
echo "[3/4] Building and pushing Docker image..."

# Read NEXT_PUBLIC_* vars from Secret Manager for build args
FIREBASE_BUILD_ARGS=""
for SECRET in NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN; do
  VALUE=$(gcloud secrets versions access latest --secret="${SECRET}" --project="${PROJECT_ID}" 2>/dev/null || echo "")
  if [ -n "$VALUE" ]; then
    FIREBASE_BUILD_ARGS="${FIREBASE_BUILD_ARGS} --build-arg ${SECRET}=${VALUE}"
  fi
done

docker build \
  ${FIREBASE_BUILD_ARGS} \
  --build-arg "NEXT_PUBLIC_DATAVIZ_DATABASE_ID=${DATABASE_ID}" \
  -t "${IMAGE}" \
  .

docker push "${IMAGE}"

# ── Step 4: Deploy to Cloud Run ──────────────────────────────
echo "[4/4] Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300s \
  --set-env-vars="NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1,DATAVIZ_DATABASE_ID=${DATABASE_ID}" \
  --update-secrets="BIGQUERY_PROJECT_ID=BIGQUERY_PROJECT_ID:latest,BIGQUERY_LOCATION=BIGQUERY_LOCATION:latest,BIGQUERY_DATASET=BIGQUERY_DATASET:latest,ADMIN_EMAIL_DOMAIN=ADMIN_EMAIL_DOMAIN:latest,GOOGLE_CLOUD_PROJECT=GOOGLE_CLOUD_PROJECT:latest,GOOGLE_CLOUD_LOCATION=GOOGLE_CLOUD_LOCATION:latest,GOOGLE_VERTEX_PROJECT=GOOGLE_VERTEX_PROJECT:latest,GOOGLE_VERTEX_LOCATION=GOOGLE_VERTEX_LOCATION:latest,FIRECRAWL_API_KEY=FIRECRAWL_API_KEY:latest"

# ── Done ─────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)" 2>/dev/null || echo "")

echo ""
echo "============================================"
echo "  Deploy concluido!"
if [ -n "$SERVICE_URL" ]; then
  echo "  URL: ${SERVICE_URL}"
fi
echo "============================================"
