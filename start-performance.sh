#!/bin/bash

echo "🚀 Starting OSRM Batch Routing with ULTRA-HIGH PERFORMANCE settings..."

# Copy performance environment
cp backend/.env.performance backend/.env

# Set environment for Docker
export BATCH_SIZE=1000
export OSRM_MAX_CONCURRENT=100
export OSRM_REQUEST_DELAY=0
export JOB_TIMEOUT=7200000

echo "📊 Performance configuration:"
echo "  - Batch size: 1000 rows"
echo "  - Concurrent requests: 100"
echo "  - Request delay: 0ms"
echo "  - Job timeout: 2 hours"

# Start with Docker Compose
docker compose up --build

echo "✅ Application available at http://localhost:8888"