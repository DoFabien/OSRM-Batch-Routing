# Changelog

## [2.0.0] - 2025-12-06

### 🆕 New Features
- **Streaming GeoJSON Storage**: Results are now saved to disk using efficient streaming to handle large datasets
- **File-based Downloads**: GeoJSON files served directly from disk with fallback to memory generation
- **Automatic Cleanup Schedulers**: Configurable cleanup for uploads, logs, and results
- **Environment Configuration**: All storage paths and limits configurable via environment variables
- **Production OSRM Data**: Support for full France dataset (france-latest.osm.pbf)
- **Log Rotation**: Winston-based log rotation with size limits (10MB) and file retention (5 files)

### 🔧 Technical Improvements
- **ResultService**: New service for managing GeoJSON file lifecycle
- **Docker Configuration**: Parameterized volume mounts for flexible deployment
- **Memory Optimization**: Large GeoJSON files no longer stored entirely in memory
- **Persistent Storage**: Results survive container restarts
- **Configurable Limits**: File sizes, retention counts, and cleanup intervals

### 📁 Storage Structure
```
/data/
├── uploads/          # CSV input files
├── logs/            # Application logs (rotated)
├── results/         # Generated GeoJSON files (streamed)
└── osrm-data/       # OSRM routing data
```

### ⚙️ Environment Variables
- `RESULTS_DIR` / `HOST_RESULTS_DIR`: GeoJSON storage paths
- `MAX_RESULTS_KEPT`: Number of result files to retain (default: 100)
- `MAX_FILES_KEPT`: Number of upload files to retain (default: 50)
- `MAX_JOBS_KEPT`: Number of jobs to keep in memory (default: 100)
- `FILE_CLEANUP_INTERVAL`: Cleanup frequency in hours (default: 24)

### 🌐 Demo
Live demo available at: [https://osrm-batch-routing.dogeo.fr/](https://osrm-batch-routing.dogeo.fr/)

### 💡 Migration Notes
- Update your `.env` file with new variables
- Configure `HOST_*_DIR` variables for production deployment
- OSRM data can now handle full country datasets (tested with France)

---

## [1.0.0] - Previous Version
- Initial Angular + Node.js implementation
- In-memory result storage
- Basic file upload and routing functionality