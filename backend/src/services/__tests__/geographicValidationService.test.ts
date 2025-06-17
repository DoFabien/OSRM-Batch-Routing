import { 
  isWithinFranceBounds, 
  validateCoordinatesInFrance, 
  FRANCE_BOUNDS,
  getFranceCoverageDescription,
  checkBoundsCompatibility 
} from '../geographicValidationService';

describe('GeographicValidationService', () => {
  describe('isWithinFranceBounds', () => {
    test('should accept coordinates within France metropolitan bounds', () => {
      // Paris
      expect(isWithinFranceBounds(48.8566, 2.3522)).toBe(true);
      
      // Marseille
      expect(isWithinFranceBounds(43.2965, 5.3698)).toBe(true);
      
      // Lille
      expect(isWithinFranceBounds(50.6292, 3.0573)).toBe(true);
      
      // Brest
      expect(isWithinFranceBounds(48.3904, -4.4861)).toBe(true);
    });

    test('should accept coordinates in Corsica', () => {
      // Ajaccio
      expect(isWithinFranceBounds(41.9196, 8.7389)).toBe(true);
      
      // Bastia
      expect(isWithinFranceBounds(42.7027, 9.4494)).toBe(true);
    });

    test('should reject coordinates outside France bounds', () => {
      // Londres
      expect(isWithinFranceBounds(51.5074, -0.1278)).toBe(false);
      
      // Madrid
      expect(isWithinFranceBounds(40.4168, -3.7038)).toBe(false);
      
      // Rome
      expect(isWithinFranceBounds(41.9028, 12.4964)).toBe(false);
      
      // Berlin
      expect(isWithinFranceBounds(52.5200, 13.4050)).toBe(false);
    });

    test('should reject invalid coordinates', () => {
      expect(isWithinFranceBounds(NaN, 2.3522)).toBe(false);
      expect(isWithinFranceBounds(48.8566, NaN)).toBe(false);
      expect(isWithinFranceBounds(91, 2.3522)).toBe(false); // Latitude trop haute
      expect(isWithinFranceBounds(48.8566, 181)).toBe(false); // Longitude trop haute
    });
  });

  describe('validateCoordinatesInFrance', () => {
    test('should validate all coordinates within France', () => {
      const coordinates = [
        { lat: 48.8566, lon: 2.3522, rowIndex: 0 }, // Paris
        { lat: 43.2965, lon: 5.3698, rowIndex: 1 }, // Marseille
        { lat: 41.9196, lon: 8.7389, rowIndex: 2 }, // Ajaccio
      ];

      const result = validateCoordinatesInFrance(coordinates);

      expect(result.isValid).toBe(true);
      expect(result.invalidCount).toBe(0);
      expect(result.invalidRows).toHaveLength(0);
      expect(result.bounds.minLat).toBeCloseTo(41.9196, 4);
      expect(result.bounds.maxLat).toBeCloseTo(48.8566, 4);
    });

    test('should identify coordinates outside France', () => {
      const coordinates = [
        { lat: 48.8566, lon: 2.3522, rowIndex: 0 }, // Paris (valide)
        { lat: 51.5074, lon: -0.1278, rowIndex: 1 }, // Londres (invalide)
        { lat: 40.4168, lon: -3.7038, rowIndex: 2 }, // Madrid (invalide)
      ];

      const result = validateCoordinatesInFrance(coordinates);

      expect(result.isValid).toBe(false);
      expect(result.invalidCount).toBe(2);
      expect(result.invalidRows).toHaveLength(2);
      
      // Vérifier les détails des coordonnées invalides
      expect(result.invalidRows[0]).toEqual({
        rowIndex: 1,
        lat: 51.5074,
        lon: -0.1278,
        reason: 'Coordonnées hors du périmètre France métropolitaine + Corse'
      });
      
      expect(result.invalidRows[1]).toEqual({
        rowIndex: 2,
        lat: 40.4168,
        lon: -3.7038,
        reason: 'Coordonnées hors du périmètre France métropolitaine + Corse'
      });
    });

    test('should handle invalid coordinate values', () => {
      const coordinates = [
        { lat: 48.8566, lon: 2.3522, rowIndex: 0 }, // Paris (valide)
        { lat: NaN, lon: 2.3522, rowIndex: 1 }, // Latitude invalide
        { lat: 48.8566, lon: 200, rowIndex: 2 }, // Longitude invalide
      ];

      const result = validateCoordinatesInFrance(coordinates);

      expect(result.isValid).toBe(false);
      expect(result.invalidCount).toBe(2);
      expect(result.invalidRows[0].reason).toBe('Coordonnées invalides (hors plage géographique globale)');
      expect(result.invalidRows[1].reason).toBe('Coordonnées invalides (hors plage géographique globale)');
    });

    test('should calculate correct bounds', () => {
      const coordinates = [
        { lat: 43.0, lon: 2.0, rowIndex: 0 },
        { lat: 49.0, lon: 7.0, rowIndex: 1 },
        { lat: 45.0, lon: 4.0, rowIndex: 2 },
      ];

      const result = validateCoordinatesInFrance(coordinates);

      expect(result.bounds.minLat).toBe(43.0);
      expect(result.bounds.maxLat).toBe(49.0);
      expect(result.bounds.minLon).toBe(2.0);
      expect(result.bounds.maxLon).toBe(7.0);
    });

    test('should handle empty coordinate array', () => {
      const coordinates: { lat: number; lon: number; rowIndex: number }[] = [];
      const result = validateCoordinatesInFrance(coordinates);

      expect(result.bounds.minLat).toBe(0);
      expect(result.bounds.maxLat).toBe(0);
      expect(result.bounds.minLon).toBe(0);
      expect(result.bounds.maxLon).toBe(0);
    });
  });

  describe('FRANCE_BOUNDS', () => {
    test('should have correct bounds for France + Corsica', () => {
      expect(FRANCE_BOUNDS.minLat).toBe(41.0); // Sud de la Corse
      expect(FRANCE_BOUNDS.maxLat).toBe(51.5); // Nord de la France
      expect(FRANCE_BOUNDS.minLon).toBe(-5.5); // Ouest (Finistère)
      expect(FRANCE_BOUNDS.maxLon).toBe(10.0); // Est (Alpes + marge)
    });
  });

  describe('getFranceCoverageDescription', () => {
    test('should return descriptive text', () => {
      const description = getFranceCoverageDescription();
      expect(description).toContain('France métropolitaine');
      expect(description).toContain('Corse');
      expect(description).toContain('latitude');
      expect(description).toContain('longitude');
    });
  });

  describe('checkBoundsCompatibility', () => {
    test('should approve bounds within France', () => {
      const compatibleBounds = {
        minLat: 42.0,
        maxLat: 50.0,
        minLon: -4.0,
        maxLon: 8.0
      };

      const result = checkBoundsCompatibility(compatibleBounds);
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    test('should detect bounds extending beyond France', () => {
      const incompatibleBounds = {
        minLat: 35.0, // Trop au sud
        maxLat: 55.0, // Trop au nord
        minLon: -10.0, // Trop à l'ouest
        maxLon: 15.0  // Trop à l'est
      };

      const result = checkBoundsCompatibility(incompatibleBounds);
      expect(result.compatible).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      
      // Vérifier que toutes les limites problématiques sont identifiées
      const warningsText = result.warnings.join(' ');
      expect(warningsText).toContain('Latitude minimale trop basse');
      expect(warningsText).toContain('Latitude maximale trop haute');
      expect(warningsText).toContain('Longitude minimale trop basse');
      expect(warningsText).toContain('Longitude maximale trop haute');
    });
  });
});