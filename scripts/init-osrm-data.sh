#!/bin/bash
set -e

DATA_DIR="/data"
FRANCE_PBF_URL="https://download.geofabrik.de/europe/france-latest.osm.pbf"
FRANCE_PBF_FILE="$DATA_DIR/france-latest.osm.pbf"
FRANCE_OSRM_FILE="$DATA_DIR/france-latest.osrm"

echo "🚀 Initializing OSRM data..."

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Check if OSRM files already exist
if ls "$DATA_DIR"/*.osrm 1> /dev/null 2>&1; then
    echo "✅ OSRM files already exist in $DATA_DIR"
    echo "📁 Found files:"
    ls -la "$DATA_DIR"/*.osrm
    echo "🏃 Skipping download and processing..."
    exit 0
fi

echo "📂 No OSRM files found in $DATA_DIR"
echo "🌍 Downloading France data from Geofabrik..."

# Download France PBF file if it doesn't exist
if [ ! -f "$FRANCE_PBF_FILE" ]; then
    echo "⬇️  Downloading $FRANCE_PBF_URL..."
    curl -L -o "$FRANCE_PBF_FILE" "$FRANCE_PBF_URL" || {
        echo "❌ Failed to download France data"
        exit 1
    }
    echo "✅ Download completed: $FRANCE_PBF_FILE"
else
    echo "✅ France PBF file already exists: $FRANCE_PBF_FILE"
fi

echo "🔧 Processing OSRM data..."

# Extract OSRM data
echo "📤 Extracting OSRM data..."
osrm-extract -p /opt/car.lua "$FRANCE_PBF_FILE" || {
    echo "❌ Failed to extract OSRM data"
    exit 1
}

# Partition OSRM data
echo "🔀 Partitioning OSRM data..."
osrm-partition "$FRANCE_OSRM_FILE" || {
    echo "❌ Failed to partition OSRM data"
    exit 1
}

# Customize OSRM data
echo "⚙️  Customizing OSRM data..."
osrm-customize "$FRANCE_OSRM_FILE" || {
    echo "❌ Failed to customize OSRM data"
    exit 1
}

echo "🎉 OSRM data processing completed successfully!"
echo "📁 Generated files:"
ls -la "$DATA_DIR"/france-latest.*

# Clean up PBF file to save space (optional)
if [ "${KEEP_PBF_FILE:-false}" != "true" ]; then
    echo "🧹 Cleaning up PBF file to save space..."
    rm -f "$FRANCE_PBF_FILE"
    echo "✅ PBF file removed"
fi

echo "✅ OSRM initialization complete!"