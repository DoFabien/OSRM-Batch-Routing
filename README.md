# OSRM Batch Routing V2

Modern batch routing application using OSRM with Angular frontend and Node.js backend.

## 🌐 Live Demo
**[https://osrm-batch-routing.dogeo.fr/](https://osrm-batch-routing.dogeo.fr/)**

*Running on full France OSRM dataset (france-latest.osm.pbf)*

## 🏗️ Architecture

- **Frontend**: Angular 20 + Angular Material
- **Backend**: Node.js + TypeScript + Express
- **Routing Engine**: OSRM (integrated via Docker)
- **Containerization**: Docker Compose

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)

### Configuration des Variables d'Environnement

#### Fichiers de Configuration
1. Copiez `.env.example` vers `.env` pour configurer votre environnement
2. Modifiez les valeurs selon vos besoins

#### Variables Disponibles

##### Configuration de Base
- `NODE_ENV`: Environnement d'exécution (production/development)
- `PORT`: Port d'écoute de l'application (défaut: 80)
- `OSRM_URL`: URL du service OSRM (défaut: http://osrm:5000)

##### Stockage des Fichiers
- `UPLOAD_DIR`: Répertoire des fichiers uploadés (défaut: ./uploads)
- `LOG_DIR`: Répertoire des logs (défaut: ./logs)
- `OSRM_DATA_DIR`: Répertoire des données OSRM (défaut: ./osrm-data)

##### Gestion des Fichiers
- `MAX_FILE_SIZE`: Taille max des fichiers en octets (défaut: 52428800 = 50MB)
- `MAX_FILES_KEPT`: Nombre de fichiers à conserver (défaut: 50)
- `MAX_JOBS_KEPT`: Nombre de jobs à conserver en mémoire (défaut: 100)
- `FILE_CLEANUP_INTERVAL`: Intervalle de nettoyage en heures (défaut: 24)

##### Logging
- `LOG_LEVEL`: Niveau de log (défaut: info)
- Rotation automatique: 10MB par fichier, 5 fichiers max

### Using Docker (Recommended)
```bash
# Clone and setup
git clone <repo>
cd OSRM-Batch-Routing

# Configurer l'environnement
cp .env.example .env
# Éditez .env selon vos besoins

# Variables pour volumes externes (optionnel)
export HOST_UPLOAD_DIR=/path/to/your/uploads
export HOST_LOG_DIR=/path/to/your/logs
export HOST_OSRM_DATA_DIR=/path/to/your/osrm-data

# Build and start all services
docker-compose up -d

# Access application
# Frontend: http://localhost:8888
```

### Local Development
```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev

# Frontend: http://localhost:4200
# Backend: http://localhost:3001
```

## 📋 Features

### ✅ Core Features
- CSV/TSV file upload with validation
- 80+ coordinate system projections support
- Batch routing calculation with OSRM
- Real-time progress tracking
- GeoJSON export with enriched properties
- Error reporting and handling
- **Streaming GeoJSON storage** - efficient disk-based results
- **Automatic file cleanup** - keeps only recent files
- **Log rotation** - prevents log accumulation
- **Configurable storage paths** - environment variables
- **Production-ready** - tested with full France dataset

### 🚧 V2 Enhancements
- Modern TypeScript architecture
- Responsive Angular Material UI
- Docker containerization
- RESTful API design
- Async job processing
- Enhanced error handling
- Comprehensive validation
- **Automatic cleanup schedulers**
- **Environment variable configuration**
- **Production-ready file management**
- **Streaming result storage** - handles large datasets efficiently
- **Persistent file storage** - results survive container restarts

## 🛠️ Development

### Project Structure
```
├── backend/          # Node.js TypeScript API
│   ├── src/
│   │   ├── routes/   # API endpoints
│   │   ├── services/ # Business logic
│   │   └── types/    # TypeScript definitions
├── frontend/         # Angular application
│   ├── src/app/
│   │   ├── components/
│   │   ├── services/
│   │   └── models/
├── docker-compose.yml
└── Dockerfile
```

### API Endpoints
- `POST /api/upload` - Upload CSV/TSV files
- `GET /api/projections` - Get available projections
- `POST /api/routing/batch` - Start batch routing job
- `GET /api/routing/status/:jobId` - Get job status
- `GET /api/export/:jobId` - Download results

## 🧹 Automatic Cleanup

### Uploaded Files
- Automatic cleanup every 24h (configurable via `FILE_CLEANUP_INTERVAL`)
- Keeps the 50 most recent files (configurable via `MAX_FILES_KEPT`)
- Physical deletion from disk and memory

### Jobs/Results
- Automatic cleanup of jobs in memory
- Keeps the 100 most recent jobs (configurable via `MAX_JOBS_KEPT`)
- **GeoJSON files saved to disk** - persistent storage with streaming

### Result Files (GeoJSON)
- Automatic cleanup of old result files
- Keeps the 100 most recent files (configurable via `MAX_RESULTS_KEPT`)
- Efficient streaming generation to handle large datasets
- Files survive container restarts

### Logs
- Automatic rotation by size (10MB max per file)
- Keeps 5 log files
- Automatic cleanup by Winston

## 📁 Directory Structure

```
/app/
├── uploads/          # CSV uploaded files
├── logs/            # Application logs
│   ├── combined.log # All logs
│   └── error.log    # Error logs only
├── results/         # Generated GeoJSON files (streamed)
└── osrm-data/       # OSRM data (.osm.pbf, .osrm)
```

## 🔧 Docker Configuration

### Variables for docker-compose.yml
```bash
# External volumes (absolute paths recommended)
export HOST_UPLOAD_DIR=/path/to/your/uploads
export HOST_LOG_DIR=/path/to/your/logs
export HOST_OSRM_DATA_DIR=/path/to/your/osrm-data
export HOST_RESULTS_DIR=/path/to/your/results

# Application configuration
export NODE_ENV=production
export LOG_LEVEL=info
export MAX_FILES_KEPT=50
export MAX_RESULTS_KEPT=100
```

### Starting with custom variables
```bash
# With .env file
docker-compose up -d

# With inline variables
HOST_UPLOAD_DIR=/data/uploads HOST_LOG_DIR=/data/logs docker-compose up -d
```

### OSRM Data for Production
For production use with full France coverage:
```bash
# Download France OSM data
wget https://download.geofabrik.de/europe/france-latest.osm.pbf -O osrm-data/france-latest.osm.pbf

# Process with OSRM (in osrm-data directory)
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/france-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/france-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/france-latest.osrm

# Update docker-compose command to use france data
# command: osrm-routed --algorithm mld /data/france-latest.osrm
```

### Monitoring
```bash
# Application logs
docker-compose logs -f app

# OSRM logs
docker-compose logs -f osrm

# Container status
docker-compose ps
```

## 🛡️ Security

- File type validation (CSV/TSV only)
- Configurable file size limits
- Automatic cleanup of temporary data
- Rotating logs to prevent accumulation
- Docker network isolation

## 📊 Migration from V1

This V2 version is a complete rewrite of the original PHP/AngularJS application.

### Key Improvements
- ⚡ **Performance**: Modern TypeScript + async processing
- 🛡️ **Security**: Input validation + containerization
- 📱 **Mobile**: Responsive Angular Material design
- 🔧 **Maintainability**: Clean architecture + type safety
- 🐳 **Deployment**: Docker containerization
- 🗂️ **File Management**: Automatic cleanup + configurable storage
- 📊 **Monitoring**: Structured logging + health checks  
- 💾 **Storage**: Streaming GeoJSON + persistent results
- 🌍 **Scale**: Production-ready with full country datasets

## 📄 License

MIT License - see LICENSE file for details.