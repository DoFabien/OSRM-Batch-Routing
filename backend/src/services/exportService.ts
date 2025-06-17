import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import * as wkx from 'wkx';
import type { LineString } from 'geojson';
import type { BatchResult, RouteResult, GeographicBounds } from '@/types';
import { logger } from '@/utils/logger';

export interface ExportOptions {
  format: 'geojson' | 'geopackage';
  outputPath: string;
  batchSize?: number;
}

export interface GeoPackageMetadata {
  tableName: string;
  description: string;
  bounds: GeographicBounds;
  totalFeatures: number;
}

/**
 * Service d'export pour différents formats géographiques
 */
export class ExportService {
  private readonly templatePath = path.join(__dirname, '../resources/empty.gpkg');
  private readonly defaultBatchSize = 1000;
  private readonly resultDir = process.env['RESULTS_DIR'] || '/app/results';

  /**
   * Génère la géométrie encodée pour GeoPackage (format GPKG)
   * Basé sur la spécification OGC GeoPackage
   */
  private generateGpkgGeom(wkbHex: string, srid = 4326): Buffer {
    try {
      const wkbBuff = Buffer.from(wkbHex, 'hex');
      const geometry = wkx.Geometry.parse(wkbBuff);
      
      // En-tête GPKG (8 bytes)
      const header = Buffer.alloc(8);
      header.write('GP', 0, 2);  // Magic number
      header.writeUInt8(0, 2);   // Version
      
      // Flags (1 byte)
      let flag = 0;
      const binaryType = 0;       // Geometry type (standard WKB)
      flag += binaryType << 5;
      const emptyValue = 0;       // Non-empty geometry
      flag += emptyValue << 4;
      const envelopeIndicator = 0; // No envelope
      flag += envelopeIndicator << 1;
      const byteOrderValue = 0;   // Big endian
      flag += byteOrderValue;
      
      header.writeUInt8(flag, 3);
      
      // SRS ID (4 bytes, big endian)
      header.writeUInt32BE(srid, 4);
      
      // Envelope buffer (vide car envelopeIndicator = 0)
      const envelopeBuffer = Buffer.alloc(0);
      
      // Assemblage final
      const concatArray = [header, envelopeBuffer];
      concatArray.push(geometry.toWkb());
      
      return Buffer.concat(concatArray);
    } catch (error) {
      logger.error('Erreur lors de la génération de la géométrie GPKG:', error);
      throw error;
    }
  }

  /**
   * Calcule les bounds géographiques d'un ensemble de résultats
   */
  private calculateBounds(results: RouteResult[]): GeographicBounds {
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    results.forEach(result => {
      if (result.success && result.route?.geometry) {
        const coords = result.route.geometry.coordinates;
        coords.forEach(([lon, lat]) => {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        });
      }
    });

    return {
      minLat: minLat === Infinity ? 0 : minLat,
      maxLat: maxLat === -Infinity ? 0 : maxLat,
      minLon: minLon === Infinity ? 0 : minLon,
      maxLon: maxLon === -Infinity ? 0 : maxLon
    };
  }

  /**
   * Exporte les résultats vers un fichier GeoPackage
   */
  async exportToGeoPackage(
    batchResult: BatchResult,
    outputPath: string,
    metadata: GeoPackageMetadata
  ): Promise<void> {
    // Vérifier que le template existe
    if (!fs.existsSync(this.templatePath)) {
      logger.error(`Template GeoPackage non trouvé: ${this.templatePath}`);
      throw new Error(`Template GeoPackage non trouvé: ${this.templatePath}`);
    }

    try {
      // Copier le template vide
      fs.copyFileSync(this.templatePath, outputPath);
      
      // Ouvrir la base de données
      const db = new Database(outputPath);
      
      try {
        // Démarrer une transaction pour de meilleures performances
        const transaction = db.transaction(() => {
          this.initializeGeoPackageTables(db, metadata);
          this.insertFeatures(db, batchResult.results, metadata.tableName);
        });
        
        transaction();
        
      } finally {
        db.close();
      }
      
    } catch (error) {
      // Nettoyer le fichier en cas d'erreur
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      throw error;
    }
  }

  /**
   * Initialise les tables système GeoPackage
   */
  private initializeGeoPackageTables(db: Database.Database, metadata: GeoPackageMetadata): void {
    const { tableName, description, bounds, totalFeatures } = metadata;
    
    // Insérer dans gpkg_contents
    const insertContent = db.prepare(`
      INSERT INTO gpkg_contents (
        table_name, data_type, identifier, description, 
        last_change, min_x, min_y, max_x, max_y, srs_id
      ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
    `);
    
    insertContent.run(
      tableName, 'features', tableName, description,
      bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat, 4326
    );

    // Insérer dans gpkg_geometry_columns
    const insertGeomColumns = db.prepare(`
      INSERT INTO gpkg_geometry_columns (
        table_name, column_name, geometry_type_name, srs_id, z, m
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    insertGeomColumns.run(tableName, 'geom', 'LINESTRING', 4326, 0, 0);

    // Insérer dans gpkg_ogr_contents (optionnel, pour compatibilité GDAL)
    const insertOgrContents = db.prepare(`
      INSERT INTO gpkg_ogr_contents (table_name, feature_count) VALUES (?, ?)
    `);
    
    insertOgrContents.run(tableName, totalFeatures);

    // Créer la table des features
    db.exec(`
      CREATE TABLE ${tableName} (
        fid INTEGER PRIMARY KEY AUTOINCREMENT,
        geom BLOB,
        distance REAL,
        duration REAL,
        start_lat REAL,
        start_lon REAL,
        end_lat REAL,
        end_lon REAL,
        row_index INTEGER,
        success INTEGER,
        error_message TEXT
      )
    `);
  }

  /**
   * Insère les features par batch dans la table
   */
  private insertFeatures(
    db: Database.Database, 
    results: RouteResult[], 
    tableName: string
  ): void {
    const insertStmt = db.prepare(`
      INSERT INTO ${tableName} (
        geom, distance, duration, start_lat, start_lon, 
        end_lat, end_lon, row_index, success, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batchSize = this.defaultBatchSize;
    let processed = 0;

    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      
      // Traitement du batch
      for (const result of batch) {
        try {
          let geomBlob: Buffer | null = null;
          
          if (result.success && result.route?.geometry) {
            // Convertir GeoJSON LineString vers WKB puis GPKG
            const lineString = result.route.geometry;
            
            // Créer une LineString WKX à partir des coordonnées
            const points = lineString.coordinates.map(([x, y]) => new wkx.Point(x, y));
            const geom = new wkx.LineString(points);
            const wkbHex = geom.toWkb().toString('hex');
            geomBlob = this.generateGpkgGeom(wkbHex, 4326);
          }

          // Extraire les coordonnées de début/fin depuis les données originales
          const originalData = result.originalData;
          let startLat: number | null = null, startLon: number | null = null;
          let endLat: number | null = null, endLon: number | null = null;

          // Essayer d'extraire les coordonnées (adaptez selon votre structure de données)
          // Ceci est un exemple générique, à adapter selon vos champs
          for (const [key, value] of Object.entries(originalData)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('lat') && lowerKey.includes('origin') || lowerKey.includes('smur')) {
              startLat = parseFloat(value);
            } else if (lowerKey.includes('lon') && lowerKey.includes('origin') || lowerKey.includes('smur')) {
              startLon = parseFloat(value);
            } else if (lowerKey.includes('lat') && lowerKey.includes('dest') || lowerKey.includes('aurh')) {
              endLat = parseFloat(value);
            } else if (lowerKey.includes('lon') && lowerKey.includes('dest') || lowerKey.includes('aurh')) {
              endLon = parseFloat(value);
            }
          }

          insertStmt.run(
            geomBlob,
            result.route?.distance || null,
            result.route?.duration || null,
            startLat,
            startLon,
            endLat,
            endLon,
            result.rowIndex,
            result.success ? 1 : 0,
            result.error || null
          );

          processed++;
          
        } catch (error) {
          logger.warn(`Erreur insertion feature ${result.rowIndex}:`, error);
          // Insérer quand même l'enregistrement sans géométrie
          insertStmt.run(
            null, null, null, null, null, null, null,
            result.rowIndex, 0, error instanceof Error ? error.message : 'Erreur inconnue'
          );
        }
      }
    }
  }

  /**
   * Exporte vers format GeoJSON (méthode existante améliorée)
   */
  async exportToGeoJSON(batchResult: BatchResult, outputPath: string): Promise<void> {
    const features = batchResult.results
      .filter(result => result.success && result.route?.geometry)
      .map(result => ({
        type: 'Feature' as const,
        properties: {
          distance: result.route!.distance,
          duration: result.route!.duration,
          rowIndex: result.rowIndex,
          ...result.originalData
        },
        geometry: result.route!.geometry
      }));

    const geoJson = {
      type: 'FeatureCollection' as const,
      features
    };

    await fs.promises.writeFile(outputPath, JSON.stringify(geoJson, null, 2));
  }


  /**
   * Point d'entrée principal pour l'export
   */
  async exportBatchResults(
    batchResult: BatchResult,
    options: ExportOptions,
    metadata?: Partial<GeoPackageMetadata>
  ): Promise<void> {
    switch (options.format) {
      case 'geopackage': {
        const gpkgMetadata: GeoPackageMetadata = {
          tableName: metadata?.tableName || 'routes',
          description: metadata?.description || 'Route calculations',
          bounds: metadata?.bounds || this.calculateBounds(batchResult.results),
          totalFeatures: batchResult.summary.successful
        };
        await this.exportToGeoPackage(batchResult, options.outputPath, gpkgMetadata);
        break;
      }
      
      case 'geojson':
        await this.exportToGeoJSON(batchResult, options.outputPath);
        break;
        
      default:
        logger.error(`Unsupported export format: ${options.format}`);
        throw new Error(`Format d'export non supporté: ${options.format}`);
    }
  }

  /**
   * Crée un GeoPackage vide pour un job avec tous les champs du CSV
   */
  async createJobGeoPackage(
    jobId: string, 
    csvHeaders: string[], 
    metadata: Partial<GeoPackageMetadata> = {}
  ): Promise<string> {
    const outputPath = path.join(this.resultDir, `${jobId}.gpkg`);
    
    // Vérifier que le template existe
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`Template GeoPackage non trouvé: ${this.templatePath}`);
    }

    try {
      // Copier le template vide
      fs.copyFileSync(this.templatePath, outputPath);
      
      // Ouvrir la base de données
      const db = new Database(outputPath);
      
      try {
        // Optimisations SQLite pour création initiale
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = 1000000');
        db.pragma('locking_mode = EXCLUSIVE');
        db.pragma('temp_store = MEMORY');
        
        const gpkgMetadata: GeoPackageMetadata = {
          tableName: metadata.tableName || 'routes',
          description: metadata.description || `Route calculations for job ${jobId}`,
          bounds: metadata.bounds || { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 },
          totalFeatures: 0 // Will be updated as we insert
        };

        // Initialiser les tables GeoPackage
        this.initializeGeoPackageTablesWithCSVFields(db, gpkgMetadata, csvHeaders);
        
        return outputPath;
      } finally {
        db.close();
      }
    } catch (error) {
      logger.error(`Erreur création GeoPackage initial ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Insère un résultat de route directement dans le GeoPackage existant (optimisé avec WAL)
   */
  async insertRouteResult(geoPackagePath: string, routeResult: RouteResult, tableName: string = 'routes'): Promise<void> {
    if (!fs.existsSync(geoPackagePath)) {
      throw new Error(`GeoPackage non trouvé: ${geoPackagePath}`);
    }

    const db = new Database(geoPackagePath);
    
    try {
      // Activer WAL mode pour de meilleures performances
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('cache_size = 1000000');
      db.pragma('locking_mode = EXCLUSIVE');
      db.pragma('temp_store = MEMORY');
      
      // Préparer les colonnes dynamiques basées sur originalData
      const originalData = routeResult.originalData;
      const columns = Object.keys(originalData);
      
      // Construire la requête INSERT dynamique
      const placeholders = [
        '?', // geom
        '?', // distance
        '?', // duration
        '?', // row_index
        '?', // success
        '?', // error_message
        ...columns.map(() => '?') // Un placeholder pour chaque colonne CSV
      ].join(', ');
      
      const insertQuery = `
        INSERT INTO ${tableName} (
          geom, distance, duration, row_index, success, error_message,
          ${columns.map(col => `"${col}"`).join(', ')}
        ) VALUES (${placeholders})
      `;
      
      const stmt = db.prepare(insertQuery);
      
      // Préparer les valeurs
      const geomBlob = routeResult.success && routeResult.route?.geometry 
        ? this.encodeLineStringGeometry(routeResult.route.geometry.coordinates)
        : null;
      
      const values = [
        geomBlob,
        routeResult.route?.distance || null,
        routeResult.route?.duration || null,
        routeResult.rowIndex,
        routeResult.success ? 1 : 0,
        routeResult.error || null,
        ...columns.map(col => originalData[col] || null)
      ];
      
      stmt.run(...values);
      
    } finally {
      db.close();
    }
  }

  /**
   * Insère plusieurs résultats en batch dans le GeoPackage (très optimisé)
   */
  async insertBatchRouteResults(geoPackagePath: string, routeResults: RouteResult[], tableName: string = 'routes'): Promise<void> {
    if (!fs.existsSync(geoPackagePath)) {
      throw new Error(`GeoPackage non trouvé: ${geoPackagePath}`);
    }

    if (routeResults.length === 0) return;

    const db = new Database(geoPackagePath);
    
    try {
      // Optimisations SQLite pour insertion en masse
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('cache_size = 1000000');
      db.pragma('locking_mode = EXCLUSIVE');
      db.pragma('temp_store = MEMORY');
      
      // Préparer les colonnes dynamiques basées sur le premier résultat
      const originalData = routeResults[0].originalData;
      const columns = Object.keys(originalData);
      
      // Construire la requête INSERT dynamique
      const placeholders = [
        '?', // geom
        '?', // distance
        '?', // duration
        '?', // row_index
        '?', // success
        '?', // error_message
        ...columns.map(() => '?') // Un placeholder pour chaque colonne CSV
      ].join(', ');
      
      const insertQuery = `
        INSERT INTO ${tableName} (
          geom, distance, duration, row_index, success, error_message,
          ${columns.map(col => `"${col}"`).join(', ')}
        ) VALUES (${placeholders})
      `;
      
      const stmt = db.prepare(insertQuery);
      
      // Transaction pour insérer tous les résultats
      const insertMany = db.transaction((results: RouteResult[]) => {
        for (const result of results) {
          try {
            // Préparer les valeurs
            const geomBlob = result.success && result.route?.geometry 
              ? this.encodeLineStringGeometry(result.route.geometry.coordinates)
              : null;
            
            const values = [
              geomBlob,
              result.route?.distance || null,
              result.route?.duration || null,
              result.rowIndex,
              result.success ? 1 : 0,
              result.error || null,
              ...columns.map(col => result.originalData[col] || null)
            ];
            
            stmt.run(...values);
          } catch (error) {
            logger.warn(`Erreur insertion résultat ${result.rowIndex}:`, error);
            // Continuer avec les autres résultats
          }
        }
      });
      
      // Exécuter la transaction
      insertMany(routeResults);
      
    } finally {
      db.close();
    }
  }

  /**
   * Encode une géométrie LineString pour GeoPackage
   */
  private encodeLineStringGeometry(coordinates: number[][]): Buffer {
    try {
      // Créer une LineString WKX à partir des coordonnées
      const points = coordinates.map(([x, y]) => new wkx.Point(x, y));
      const geom = new wkx.LineString(points);
      const wkbHex = geom.toWkb().toString('hex');
      return this.generateGpkgGeom(wkbHex, 4326);
    } catch (error) {
      logger.error('Erreur encodage géométrie LineString:', error);
      throw error;
    }
  }

  /**
   * Initialise les tables GeoPackage avec les champs CSV dynamiques
   */
  private initializeGeoPackageTablesWithCSVFields(
    db: Database.Database, 
    metadata: GeoPackageMetadata,
    csvHeaders: string[]
  ): void {
    const { tableName, description, bounds, totalFeatures } = metadata;

    // Créer les colonnes dynamiques pour tous les champs CSV
    const csvColumns = csvHeaders.map(header => `"${header}" TEXT`).join(',\n        ');
    
    // Supprimer les tables si elles existent
    db.exec(`DROP TABLE IF EXISTS ${tableName}`);
    
    // Mettre à jour gpkg_contents
    const updateContents = db.prepare(`
      INSERT OR REPLACE INTO gpkg_contents (
        table_name, data_type, identifier, description, 
        last_change, min_x, min_y, max_x, max_y, srs_id
      ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
    `);
    
    updateContents.run(
      tableName, 'features', tableName, description,
      bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat, 4326
    );

    // Mettre à jour gpkg_geometry_columns
    const updateGeomColumns = db.prepare(`
      INSERT OR REPLACE INTO gpkg_geometry_columns (
        table_name, column_name, geometry_type_name, srs_id, z, m
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    updateGeomColumns.run(tableName, 'geom', 'LINESTRING', 4326, 0, 0);

    // Mettre à jour gpkg_ogr_contents si nécessaire
    const insertOgrContents = db.prepare(`
      INSERT OR REPLACE INTO gpkg_ogr_contents (table_name, feature_count) VALUES (?, ?)
    `);
    
    insertOgrContents.run(tableName, totalFeatures);

    // Créer la table des features avec toutes les colonnes CSV
    const createTableSQL = `
      CREATE TABLE ${tableName} (
        fid INTEGER PRIMARY KEY AUTOINCREMENT,
        geom BLOB,
        distance REAL,
        duration REAL,
        row_index INTEGER,
        success INTEGER,
        error_message TEXT,
        ${csvColumns}
      )
    `;
    
    db.exec(createTableSQL);
  }
}

export const exportService = new ExportService();