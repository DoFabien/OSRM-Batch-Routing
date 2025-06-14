#!/bin/bash

# Script to initialize OSRM data
DATA_DIR="/data"
FRANCE_PBF="$DATA_DIR/france-latest.osm.pbf"
FRANCE_OSRM="$DATA_DIR/france-latest.osrm"

echo "🔧 Initializing OSRM data..."

# Check if OSRM files already exist
if [ -f "$FRANCE_OSRM" ]; then
    echo "✅ OSRM data already processed: $FRANCE_OSRM"
    exit 0
fi

# Check if PBF file exists
if [ ! -f "$FRANCE_PBF" ]; then
    echo "📥 Downloading France OSM data..."
    wget -O "$FRANCE_PBF" "https://download.geofabrik.eu/europe/france-latest.osm.pbf"
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to download France OSM data"
        exit 1
    fi
fi

echo "🔄 Processing OSM data with OSRM..."

# Extract
echo "1/3 - Extracting..."
osrm-extract -p /opt/car.lua "$FRANCE_PBF"

# Partition
echo "2/3 - Partitioning..."
osrm-partition "$DATA_DIR/france-latest.osrm"

# Customize
echo "3/3 - Customizing..."
osrm-customize "$DATA_DIR/france-latest.osrm"

echo "✅ OSRM data processing completed!"