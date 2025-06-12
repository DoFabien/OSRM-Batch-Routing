import proj4 from 'proj4';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@/utils/logger';
import type { Projection } from '@/types';

export class ProjectionService {
  private projections: Projection[] = [];

  constructor() {
    this.loadProjections();
  }

  /**
   * Load available projections from data file
   */
  private loadProjections(): void {
    try {
      const projectionsPath = join(__dirname, '../data/projections.json');
      const data = readFileSync(projectionsPath, 'utf8');
      this.projections = JSON.parse(data);
      
      logger.info(`Loaded ${this.projections.length} coordinate system projections`);
    } catch (error) {
      logger.error('Failed to load projections:', error);
      throw new Error('Failed to load coordinate system projections');
    }
  }

  /**
   * Get all available projections
   */
  getProjections(): Projection[] {
    return this.projections;
  }

  /**
   * Get projection by code
   */
  getProjectionByCode(code: string): Projection | undefined {
    return this.projections.find(p => p.code === code);
  }

  /**
   * Transform coordinates from source projection to WGS84
   */
  transformToWGS84(x: number, y: number, sourceProjection: Projection): {
    longitude: number;
    latitude: number;
  } {
    try {
      // Define source and target projections
      const sourceCRS = sourceProjection.proj4;
      const targetCRS = '+proj=longlat +datum=WGS84 +no_defs'; // WGS84

      // Perform transformation
      const [longitude, latitude] = proj4(sourceCRS, targetCRS, [x, y]);

      // Validate coordinates
      if (!this.isValidWGS84Coordinate(longitude, latitude)) {
        throw new Error(`Invalid transformed coordinates: ${longitude}, ${latitude}`);
      }

      return { longitude, latitude };
    } catch (error) {
      logger.error('Coordinate transformation failed:', {
        x,
        y,
        sourceProjection: sourceProjection.code,
        error: error instanceof Error ? error.message : error
      });
      
      throw new Error(`Failed to transform coordinates from ${sourceProjection.code} to WGS84`);
    }
  }

  /**
   * Validate WGS84 coordinates
   */
  private isValidWGS84Coordinate(longitude: number, latitude: number): boolean {
    return (
      !isNaN(longitude) &&
      !isNaN(latitude) &&
      isFinite(longitude) &&
      isFinite(latitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90
    );
  }

  /**
   * Transform batch coordinates
   */
  transformBatch(
    coordinates: Array<{ x: number; y: number; rowIndex: number; originalData: Record<string, string> }>,
    sourceProjection: Projection
  ): Array<{
    rowIndex: number;
    originalData: Record<string, string>;
    longitude: number;
    latitude: number;
    success: boolean;
    error?: string;
  }> {
    return coordinates.map(coord => {
      try {
        const transformed = this.transformToWGS84(coord.x, coord.y, sourceProjection);
        return {
          rowIndex: coord.rowIndex,
          originalData: coord.originalData,
          longitude: transformed.longitude,
          latitude: transformed.latitude,
          success: true
        };
      } catch (error) {
        return {
          rowIndex: coord.rowIndex,
          originalData: coord.originalData,
          longitude: 0,
          latitude: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown transformation error'
        };
      }
    });
  }

  /**
   * Get projections filtered by region
   */
  getProjectionsByRegion(region: string): Projection[] {
    if (!region) return this.projections;
    return this.projections.filter(p => 
      p.region.toLowerCase().includes(region.toLowerCase())
    );
  }

  /**
   * Search projections by name or code
   */
  searchProjections(query: string): Projection[] {
    if (!query) return this.projections;
    
    const lowerQuery = query.toLowerCase();
    return this.projections.filter(p =>
      p.code.toLowerCase().includes(lowerQuery) ||
      p.nom.toLowerCase().includes(lowerQuery) ||
      p.region.toLowerCase().includes(lowerQuery)
    );
  }
}

export const projectionService = new ProjectionService();