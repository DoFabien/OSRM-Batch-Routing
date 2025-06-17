import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { ExportService } from '../exportService';
import type { BatchResult, RouteResult } from '@/types';

describe('ExportService', () => {
  let exportService: ExportService;
  let tempDir: string;

  beforeAll(() => {
    exportService = new ExportService();
    tempDir = path.join(__dirname, '../../../temp-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Nettoyer les fichiers de test
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('GeoPackage Export', () => {
    const mockBatchResult: BatchResult = {
      jobId: 'test-job-1',
      status: 'completed',
      results: [
        {
          rowIndex: 0,
          originalData: {
            'smur_lat': '48.8566',
            'smur_lon': '2.3522',
            'aurh_lat': '48.8606',
            'aurh_lon': '2.3376'
          },
          success: true,
          route: {
            distance: 1234.5,
            duration: 567.8,
            geometry: {
              type: 'LineString',
              coordinates: [
                [2.3522, 48.8566],
                [2.3400, 48.8580],
                [2.3376, 48.8606]
              ]
            }
          }
        },
        {
          rowIndex: 1,
          originalData: {
            'smur_lat': '48.8700',
            'smur_lon': '2.3200',
            'aurh_lat': '48.8800',
            'aurh_lon': '2.3100'
          },
          success: true,
          route: {
            distance: 2345.6,
            duration: 678.9,
            geometry: {
              type: 'LineString',
              coordinates: [
                [2.3200, 48.8700],
                [2.3150, 48.8750],
                [2.3100, 48.8800]
              ]
            }
          }
        },
        {
          rowIndex: 2,
          originalData: {
            'smur_lat': '48.9000',
            'smur_lon': '2.4000'
          },
          success: false,
          error: 'No route found'
        }
      ],
      summary: {
        total: 3,
        successful: 2,
        failed: 1,
        totalDistance: 3580.1,
        totalDuration: 1246.7
      }
    };

    test('should export to GeoPackage successfully', async () => {
      const outputPath = path.join(tempDir, 'test-routes.gpkg');
      
      await exportService.exportBatchResults(mockBatchResult, {
        format: 'geopackage',
        outputPath
      });

      // Vérifier que le fichier a été créé
      expect(fs.existsSync(outputPath)).toBe(true);
      
      // Vérifier la structure de la base de données
      const db = new Database(outputPath);
      
      try {
        // Vérifier les tables système
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const tableNames = tables.map((t: any) => t.name);
        
        expect(tableNames).toContain('gpkg_spatial_ref_sys');
        expect(tableNames).toContain('gpkg_contents');
        expect(tableNames).toContain('gpkg_geometry_columns');
        expect(tableNames).toContain('routes');

        // Vérifier les métadonnées dans gpkg_contents
        const content = db.prepare("SELECT * FROM gpkg_contents WHERE table_name = 'routes'").get() as any;
        expect(content).toBeTruthy();
        expect(content.data_type).toBe('features');
        expect(content.srs_id).toBe(4326);

        // Vérifier les colonnes géométriques
        const geomCols = db.prepare("SELECT * FROM gpkg_geometry_columns WHERE table_name = 'routes'").get() as any;
        expect(geomCols).toBeTruthy();
        expect(geomCols.geometry_type_name).toBe('LINESTRING');
        expect(geomCols.srs_id).toBe(4326);

        // Vérifier les données insérées
        const features = db.prepare("SELECT * FROM routes").all();
        expect(features).toHaveLength(3);
        
        // Vérifier les features avec géométrie
        const successfulFeatures = features.filter((f: any) => f.success === 1);
        expect(successfulFeatures).toHaveLength(2);
        
        // Vérifier qu'au moins une géométrie existe
        const featuresWithGeom = features.filter((f: any) => f.geom !== null);
        expect(featuresWithGeom.length).toBeGreaterThan(0);
        
        // Vérifier les données attributaires
        const firstFeature = features.find((f: any) => f.row_index === 0) as any;
        expect(firstFeature.distance).toBeCloseTo(1234.5, 1);
        expect(firstFeature.duration).toBeCloseTo(567.8, 1);
        
      } finally {
        db.close();
      }
    });

    test('should handle empty results', async () => {
      const emptyResult: BatchResult = {
        jobId: 'empty-job',
        status: 'completed',
        results: [],
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
          totalDistance: 0,
          totalDuration: 0
        }
      };

      const outputPath = path.join(tempDir, 'empty-routes.gpkg');
      
      await exportService.exportBatchResults(emptyResult, {
        format: 'geopackage',
        outputPath
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      
      const db = new Database(outputPath);
      try {
        const features = db.prepare("SELECT COUNT(*) as count FROM routes").get() as any;
        expect(features.count).toBe(0);
      } finally {
        db.close();
      }
    });

    test('should handle custom metadata', async () => {
      const outputPath = path.join(tempDir, 'custom-routes.gpkg');
      
      await exportService.exportBatchResults(mockBatchResult, {
        format: 'geopackage',
        outputPath
      }, {
        tableName: 'custom_routes',
        description: 'Custom route table'
      });

      const db = new Database(outputPath);
      try {
        const content = db.prepare("SELECT * FROM gpkg_contents WHERE table_name = 'custom_routes'").get() as any;
        expect(content).toBeTruthy();
        expect(content.description).toBe('Custom route table');
        
        const features = db.prepare("SELECT COUNT(*) as count FROM custom_routes").get() as any;
        expect(features.count).toBe(3);
      } finally {
        db.close();
      }
    });

    test('should cleanup on error', async () => {
      const outputPath = path.join(tempDir, 'error-test.gpkg');
      
      // Créer un mock qui échoue
      const invalidResult = {
        ...mockBatchResult,
        results: [
          {
            ...mockBatchResult.results[0],
            route: {
              ...mockBatchResult.results[0].route!,
              geometry: null as any // Géométrie invalide
            }
          }
        ]
      };

      // L'export pourrait échouer ou réussir en gérant l'erreur
      try {
        await exportService.exportBatchResults(invalidResult, {
          format: 'geopackage',
          outputPath
        });
        
        // Si l'export réussit, vérifier que le fichier existe
        if (fs.existsSync(outputPath)) {
          expect(fs.existsSync(outputPath)).toBe(true);
        }
      } catch (error) {
        // Si l'export échoue, vérifier que le fichier a été nettoyé
        expect(fs.existsSync(outputPath)).toBe(false);
      }
    });
  });

  describe('GeoJSON Export', () => {
    const mockBatchResult: BatchResult = {
      jobId: 'geojson-test',
      status: 'completed',
      results: [
        {
          rowIndex: 0,
          originalData: { test: 'value' },
          success: true,
          route: {
            distance: 1000,
            duration: 120,
            geometry: {
              type: 'LineString',
              coordinates: [[2.0, 48.0], [2.1, 48.1]]
            }
          }
        }
      ],
      summary: {
        total: 1,
        successful: 1,
        failed: 0,
        totalDistance: 1000,
        totalDuration: 120
      }
    };

    test('should export to GeoJSON successfully', async () => {
      const outputPath = path.join(tempDir, 'test-routes.geojson');
      
      await exportService.exportBatchResults(mockBatchResult, {
        format: 'geojson',
        outputPath
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(content.type).toBe('FeatureCollection');
      expect(content.features).toHaveLength(1);
      expect(content.features[0].geometry.type).toBe('LineString');
      expect(content.features[0].properties.distance).toBe(1000);
    });
  });

  describe('Format Validation', () => {
    test('should throw error for unsupported format', async () => {
      const mockResult: BatchResult = {
        jobId: 'test',
        status: 'completed',
        results: [],
        summary: { total: 0, successful: 0, failed: 0, totalDistance: 0, totalDuration: 0 }
      };

      await expect(exportService.exportBatchResults(mockResult, {
        format: 'geoparquet' as any,
        outputPath: '/tmp/test.parquet'
      })).rejects.toThrow('Export GeoParquet pas encore implémenté');
    });
  });
});