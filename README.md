# OSRM Batch Routing

Modern batch routing application built with Angular and Node.js, powered by OSRM for high-performance route calculations.

## 🌟 Features

- **Smart File Processing**: Upload CSV/TSV files with automatic coordinate field detection
- **Multi-Projection Support**: 80+ coordinate systems supported (Lambert93, WGS84, UTM, etc.)
- **Batch Route Calculation**: Process thousands of routes efficiently using OSRM
- **Real-time Progress**: WebSocket-based live progress tracking
- **GeoJSON Export**: Download results with enriched route properties
- **Production Ready**: Automatic cleanup, logging, and error handling

## 🏗️ Architecture

- **Frontend**: Angular 20 + Angular Material
- **Backend**: Node.js + TypeScript + Express
- **Routing Engine**: OSRM (Open Source Routing Machine)
- **Deployment**: Docker Compose

## 🚀 Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
```bash
git clone https://github.com/your-repo/osrm-batch-routing.git
cd osrm-batch-routing
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env file with your settings
```

3. **Start the application**
```bash
docker-compose up -d
```

4. **Access the application**
   - Web interface: http://localhost:8888
   - API: http://localhost:8888/api

### Local Development

```bash
# Install dependencies
npm run install:all

# Start development servers
npm run dev

# Frontend: http://localhost:4200
# Backend: http://localhost:3001
```

## 🐳 Deployment

### Environment Variables

Key configuration options:

- `NODE_ENV`: Environment (production/development)
- `PORT`: Application port (default: 80)
- `OSRM_URL`: OSRM service URL (default: http://osrm:5000)
- `MAX_FILE_SIZE`: Max upload size (default: 50MB)
- `MAX_FILES_KEPT`: Files to keep (default: 50)
- `FILE_CLEANUP_INTERVAL`: Cleanup interval in hours (default: 24)

### Docker Compose Configuration

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8888:80"
    environment:
      - NODE_ENV=production
      - OSRM_URL=http://osrm:5000
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
      - ./osrm-data:/app/osrm-data
    depends_on:
      - osrm

  osrm:
    image: osrm/osrm-backend
    command: osrm-routed --algorithm mld /data/your-data.osrm
    volumes:
      - ./osrm-data:/data
    ports:
      - "5000:5000"
```

### OSRM Data Setup

The application automatically handles OSRM data setup:

- **Automatic Download**: France OSM data is downloaded automatically on first startup if not present
- **Automatic Processing**: The container processes `.osm.pbf` files into OSRM routing data
- **Persistent Storage**: Processed data is stored in the `osrm-data` volume

For custom geographic regions, place your `.osm.pbf` file in the `osrm-data` directory before starting:

```bash
# For custom region (optional)
mkdir -p osrm-data
wget https://download.geofabrik.de/europe/your-region.osm.pbf -O osrm-data/france-latest.osm.pbf

# Start the application - processing happens automatically
docker-compose up -d
```

### Production Monitoring

```bash
# View application logs
docker-compose logs -f app

# Check container health
docker stats

# Access application metrics
curl http://localhost:8888/api/health
```

## 🛡️ Security

- Input validation for CSV/TSV files
- Configurable file size limits
- Automatic cleanup of temporary data
- Rate limiting and CORS protection
- Docker container isolation

## 📄 License

MIT License - see LICENSE file for details.