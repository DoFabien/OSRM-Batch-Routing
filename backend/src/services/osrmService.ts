import axios from 'axios';
import { logger } from '@/utils/logger';
import type { OSRMResponse } from '@/types';
import type { LineString } from 'geojson';

export class OSRMService {
  private baseUrl: string;

  constructor(baseUrl: string = process.env['OSRM_URL'] || 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Calculate route between two points
   */
  async calculateRoute(
    originLng: number,
    originLat: number,
    destLng: number,
    destLat: number
  ): Promise<OSRMResponse> {
    try {
      const url = `${this.baseUrl}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      
      logger.debug(`OSRM request: ${url}`);
      
      const response = await axios.get<OSRMResponse>(url, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        }
      });

      if (response.data.code !== 'Ok') {
        throw new Error(`OSRM routing failed: ${response.data.message || response.data.code}`);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('OSRM request failed:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
        
        if (error.response?.status === 400) {
          throw new Error('Invalid coordinates or routing request');
        }
        
        if (error.code === 'ECONNREFUSED') {
          throw new Error('OSRM service is not available');
        }
      }
      
      logger.error('Unexpected error in OSRM service:', error);
      throw new Error('Routing calculation failed');
    }
  }

  /**
   * Test OSRM connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test with simple Corsica coordinates
      const response = await axios.get(`${this.baseUrl}/route/v1/driving/9.1,42.6;9.3,42.7?overview=false`, {
        timeout: 5000
      });
      
      return response.data.code === 'Ok';
    } catch (error) {
      logger.error('OSRM health check failed:', error);
      return false;
    }
  }

  /**
   * Calculate multiple routes in batch
   */
  async calculateBatchRoutes(
    coordinates: Array<{
      originLng: number;
      originLat: number;
      destLng: number;
      destLat: number;
      rowIndex: number;
      originalData: Record<string, string>;
    }>
  ): Promise<Array<{
    rowIndex: number;
    originalData: Record<string, string>;
    success: boolean;
    route?: {
      distance: number;
      duration: number;
      geometry: LineString;
    };
    error?: string;
  }>> {
    const results = [];
    
    for (const coord of coordinates) {
      try {
        const osrmResponse = await this.calculateRoute(
          coord.originLng,
          coord.originLat,
          coord.destLng,
          coord.destLat
        );

        if (osrmResponse.routes && osrmResponse.routes.length > 0) {
          const route = osrmResponse.routes[0];
          if (route && route.geometry) {
            results.push({
              rowIndex: coord.rowIndex,
              originalData: coord.originalData,
              success: true,
              route: {
                distance: route.distance,
                duration: route.duration,
                geometry: route.geometry as LineString
              }
            });
          } else {
            results.push({
              rowIndex: coord.rowIndex,
              originalData: coord.originalData,
              success: false,
              error: 'Invalid route data'
            });
          }
        } else {
          results.push({
            rowIndex: coord.rowIndex,
            originalData: coord.originalData,
            success: false,
            error: 'No route found'
          });
        }
        
        // Small delay to avoid overwhelming OSRM
        await new Promise(resolve => setTimeout(resolve, 10));
        
      } catch (error) {
        logger.error(`Route calculation failed for row ${coord.rowIndex}:`, error);
        results.push({
          rowIndex: coord.rowIndex,
          originalData: coord.originalData,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }
}

export const osrmService = new OSRMService();