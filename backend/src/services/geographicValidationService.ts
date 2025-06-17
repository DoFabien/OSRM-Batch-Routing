import type { GeographicBounds, CoordinateValidationResult } from '@/types';

/**
 * Bounds géographiques de la France métropolitaine et Corse
 * Sources : 
 * - France métropolitaine : 41.33°N - 51.12°N, -5.14°W - 9.56°E
 * - Corse incluse dans ces bounds
 * - Marge de sécurité ajoutée pour les zones frontalières
 */
export const FRANCE_BOUNDS: GeographicBounds = {
  minLat: 41.0,  // Sud de la Corse
  maxLat: 51.5,  // Nord de la France
  minLon: -5.5,  // Ouest (Finistère)
  maxLon: 10.0   // Est (Alpes, incluant marge)
};

/**
 * Valide si des coordonnées sont dans les limites de la France métropolitaine + Corse
 */
export function isWithinFranceBounds(lat: number, lon: number): boolean {
  return lat >= FRANCE_BOUNDS.minLat && 
         lat <= FRANCE_BOUNDS.maxLat && 
         lon >= FRANCE_BOUNDS.minLon && 
         lon <= FRANCE_BOUNDS.maxLon;
}

/**
 * Valide une liste de coordonnées et retourne un rapport détaillé
 */
export function validateCoordinatesInFrance(
  coordinates: Array<{ lat: number; lon: number; rowIndex: number }>
): CoordinateValidationResult {
  const invalidRows: CoordinateValidationResult['invalidRows'] = [];
  
  // Calcul des bounds réelles des données
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  
  coordinates.forEach(({ lat, lon, rowIndex }) => {
    // Mise à jour des bounds
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    
    // Validation des coordonnées
    if (!isValidCoordinate(lat, lon)) {
      invalidRows.push({
        rowIndex,
        lat,
        lon,
        reason: 'Coordonnées invalides (hors plage géographique globale)'
      });
    } else if (!isWithinFranceBounds(lat, lon)) {
      invalidRows.push({
        rowIndex,
        lat,
        lon,
        reason: 'Coordonnées hors du périmètre France métropolitaine + Corse'
      });
    }
  });
  
  return {
    isValid: invalidRows.length === 0,
    invalidCount: invalidRows.length,
    invalidRows,
    bounds: {
      minLat: minLat === Infinity ? 0 : minLat,
      maxLat: maxLat === -Infinity ? 0 : maxLat,
      minLon: minLon === Infinity ? 0 : minLon,
      maxLon: maxLon === -Infinity ? 0 : maxLon
    }
  };
}

/**
 * Validation basique des coordonnées (plage mondiale)
 */
function isValidCoordinate(lat: number, lon: number): boolean {
  return !isNaN(lat) && 
         !isNaN(lon) && 
         lat >= -90 && 
         lat <= 90 && 
         lon >= -180 && 
         lon <= 180;
}

/**
 * Retourne une description lisible du périmètre couvert
 */
export function getFranceCoverageDescription(): string {
  return 'France métropolitaine et Corse (latitude: 41.0° - 51.5°N, longitude: -5.5° - 10.0°E)';
}

/**
 * Vérifie si des bounds données débordent significativement du périmètre France
 */
export function checkBoundsCompatibility(bounds: GeographicBounds): {
  compatible: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  if (bounds.minLat < FRANCE_BOUNDS.minLat - 1) {
    warnings.push(`Latitude minimale trop basse: ${bounds.minLat.toFixed(2)}° (attendu > ${FRANCE_BOUNDS.minLat}°)`);
  }
  
  if (bounds.maxLat > FRANCE_BOUNDS.maxLat + 1) {
    warnings.push(`Latitude maximale trop haute: ${bounds.maxLat.toFixed(2)}° (attendu < ${FRANCE_BOUNDS.maxLat}°)`);
  }
  
  if (bounds.minLon < FRANCE_BOUNDS.minLon - 1) {
    warnings.push(`Longitude minimale trop basse: ${bounds.minLon.toFixed(2)}° (attendu > ${FRANCE_BOUNDS.minLon}°)`);
  }
  
  if (bounds.maxLon > FRANCE_BOUNDS.maxLon + 1) {
    warnings.push(`Longitude maximale trop haute: ${bounds.maxLon.toFixed(2)}° (attendu < ${FRANCE_BOUNDS.maxLon}°)`);
  }
  
  return {
    compatible: warnings.length === 0,
    warnings
  };
}