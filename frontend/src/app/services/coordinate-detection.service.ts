import { Injectable } from '@angular/core';

export interface CoordinateAnalysis {
  fieldName: string;
  isNumeric: boolean;
  numericRatio: number;
  coordinateRange: 'latitude' | 'longitude' | 'both' | 'unknown';
  averageValue: number;
  minValue: number;
  maxValue: number;
  sampleValues: (number | null)[];
  hasCoordinateKeyword: boolean;
  coordinateScore: number;
  suggestedType: 'originX' | 'originY' | 'destX' | 'destY' | 'unknown';
}

@Injectable({
  providedIn: 'root'
})
export class CoordinateDetectionService {

  constructor() { }

  /**
   * Analyse un échantillon de données pour détecter les champs de coordonnées
   * Version: 2.0 - Force rebuild
   */
  analyzeCoordinateFields(headers: string[], sampleData: Record<string, string>[]): CoordinateAnalysis[] {
    return headers.map(header => this.analyzeField(header, sampleData));
  }

  /**
   * Analyse un champ spécifique pour déterminer s'il contient des coordonnées
   */
  private analyzeField(fieldName: string, sampleData: Record<string, string>[]): CoordinateAnalysis {
    const values = sampleData.map(row => row[fieldName]).filter(v => v != null);
    
    // Analyse des valeurs numériques
    const numericAnalysis = this.analyzeNumericValues(values);
    
    // Analyse du nom du champ
    const keywordAnalysis = this.analyzeFieldName(fieldName);
    
    // Détermination du type de coordonnée
    const coordinateRange = this.determineCoordinateRange(numericAnalysis.cleanValues);
    
    // Calcul du score global
    const coordinateScore = this.calculateCoordinateScore(
      numericAnalysis.numericRatio,
      keywordAnalysis.hasKeyword,
      coordinateRange,
      keywordAnalysis.typeHint
    );

    // Suggestion du type de coordonnée
    const suggestedType = this.suggestCoordinateType(fieldName, coordinateRange, keywordAnalysis.typeHint);

    return {
      fieldName,
      isNumeric: numericAnalysis.numericRatio >= 0.7,
      numericRatio: numericAnalysis.numericRatio,
      coordinateRange,
      averageValue: numericAnalysis.average,
      minValue: numericAnalysis.min,
      maxValue: numericAnalysis.max,
      sampleValues: numericAnalysis.cleanValues,
      hasCoordinateKeyword: keywordAnalysis.hasKeyword,
      coordinateScore,
      suggestedType
    };
  }

  /**
   * Analyse les valeurs numériques d'un champ
   */
  private analyzeNumericValues(values: string[]) {
    let numericCount = 0;
    const cleanValues: (number | null)[] = [];
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const value of values) {
      if (value && typeof value === 'string') {
        // Remplacer virgule par point pour les décimales
        const cleanValue = value.trim().replace(',', '.');
        const numValue = parseFloat(cleanValue);
        
        if (!isNaN(numValue) && isFinite(numValue)) {
          numericCount++;
          cleanValues.push(numValue);
          sum += numValue;
          min = Math.min(min, numValue);
          max = Math.max(max, numValue);
        } else {
          cleanValues.push(null);
        }
      } else {
        cleanValues.push(null);
      }
    }

    const numericRatio = values.length > 0 ? numericCount / values.length : 0;
    const average = numericCount > 0 ? sum / numericCount : 0;

    return {
      numericRatio,
      cleanValues,
      average,
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max
    };
  }

  /**
   * Analyse le nom du champ pour détecter des mots-clés de coordonnées
   */
  private analyzeFieldName(fieldName: string): { hasKeyword: boolean; typeHint: string } {
    const lowerField = fieldName.toLowerCase();
    
    // Mots-clés pour coordonnées
    const coordinateKeywords = [
      'lat', 'latitude', 'lon', 'longitude', 'long', 'lng',
      'x', 'y', 'coord', 'position', 'pos', 'geo'
    ];

    // Mots-clés pour origine
    const originKeywords = [
      'origin', 'start', 'source', 'from', 'depart', 'smur', 'debut'
    ];

    // Mots-clés pour destination  
    const destKeywords = [
      'dest', 'destination', 'end', 'target', 'to', 'arrive', 'aurh', 'com_aurh', 'fin', 'com'
    ];

    const hasCoordinateKeyword = coordinateKeywords.some(keyword => lowerField.includes(keyword));
    
    let typeHint = 'unknown';
    
    // Vérifier d'abord les mots-clés les plus spécifiques
    if (lowerField.includes('smur')) {
      typeHint = 'origin';
    } else if (lowerField.includes('com_') || (lowerField.startsWith('com') && hasCoordinateKeyword)) {
      typeHint = 'dest';
    } else if (originKeywords.some(keyword => lowerField.includes(keyword))) {
      typeHint = 'origin';
    } else if (destKeywords.some(keyword => lowerField.includes(keyword))) {
      typeHint = 'dest';
    }

    return { hasKeyword: hasCoordinateKeyword, typeHint };
  }

  /**
   * Détermine si les valeurs sont dans une plage de coordonnées typique
   */
  private determineCoordinateRange(values: (number | null)[]): 'latitude' | 'longitude' | 'both' | 'unknown' {
    const validValues = values.filter(v => v !== null) as number[];
    
    if (validValues.length === 0) return 'unknown';

    const min = Math.min(...validValues);
    const max = Math.max(...validValues);

    // Vérifier si c'est dans la plage de latitude (-90 à 90)
    const isLatitudeRange = min >= -90 && max <= 90;
    
    // Vérifier si c'est dans la plage de longitude (-180 à 180)
    const isLongitudeRange = min >= -180 && max <= 180;

    if (isLatitudeRange && !isLongitudeRange) {
      return 'latitude';
    } else if (isLongitudeRange && !isLatitudeRange) {
      return 'longitude';
    } else if (isLatitudeRange && isLongitudeRange) {
      // Si les deux sont possibles, regarder les valeurs pour deviner
      const avgAbs = validValues.reduce((sum, v) => sum + Math.abs(v), 0) / validValues.length;
      return avgAbs > 90 ? 'longitude' : 'both';
    }

    return 'unknown';
  }

  /**
   * Calcule un score de confiance pour déterminer si c'est un champ de coordonnées
   */
  private calculateCoordinateScore(
    numericRatio: number, 
    hasKeyword: boolean, 
    coordinateRange: string,
    typeHint: string
  ): number {
    let score = 0;

    // Score basé sur le ratio numérique (0-40 points)
    score += numericRatio * 40;

    // Score basé sur la présence de mots-clés (0-30 points)
    if (hasKeyword) score += 30;

    // Score basé sur la plage de valeurs (0-20 points)
    if (coordinateRange === 'latitude' || coordinateRange === 'longitude') {
      score += 20;
    } else if (coordinateRange === 'both') {
      score += 15;
    }

    // Score basé sur le type suggéré (0-10 points)
    if (typeHint !== 'unknown') score += 10;

    return Math.min(100, score);
  }

  /**
   * Suggère le type de coordonnée basé sur l'analyse
   */
  private suggestCoordinateType(
    fieldName: string, 
    coordinateRange: string,
    typeHint: string
  ): 'originX' | 'originY' | 'destX' | 'destY' | 'unknown' {
    const lowerField = fieldName.toLowerCase();

    // Déterminer X/Y ou Longitude/Latitude
    const isX = lowerField.includes('x') || lowerField.includes('lon') || lowerField.includes('lng');
    const isY = lowerField.includes('y') || lowerField.includes('lat');

    // Si pas d'indication claire, utiliser la plage de coordonnées
    let coordType = 'unknown';
    if (isX || coordinateRange === 'longitude') {
      coordType = 'X';
    } else if (isY || coordinateRange === 'latitude') {
      coordType = 'Y';
    }

    // Log pour debug
    console.log(`Field ${fieldName}: typeHint=${typeHint}, coordType=${coordType}, isX=${isX}, isY=${isY}`);

    // Combiner avec le type (origin/dest)
    if (coordType === 'X') {
      return typeHint === 'dest' ? 'destX' : 'originX';
    } else if (coordType === 'Y') {
      return typeHint === 'dest' ? 'destY' : 'originY';
    }

    return 'unknown';
  }

  /**
   * Retourne les champs avec un score suffisant pour être des coordonnées
   */
  getCoordinateFields(analyses: CoordinateAnalysis[], minScore: number = 50): CoordinateAnalysis[] {
    return analyses.filter(analysis => analysis.coordinateScore >= minScore);
  }

  /**
   * Auto-sélection des meilleurs champs pour chaque type de coordonnée
   */
  autoSelectBestFields(analyses: CoordinateAnalysis[]): {
    originX: string | null;
    originY: string | null;
    destX: string | null;
    destY: string | null;
  } {
    const coordinateFields = this.getCoordinateFields(analyses);

    const findBestField = (targetType: 'originX' | 'originY' | 'destX' | 'destY') => {
      const candidates = coordinateFields
        .filter(field => field.suggestedType === targetType)
        .sort((a, b) => b.coordinateScore - a.coordinateScore);
      
      return candidates.length > 0 ? candidates[0].fieldName : null;
    };

    // Essayer d'abord avec les suggestions basées sur les mots-clés
    let result = {
      originX: findBestField('originX'),
      originY: findBestField('originY'),
      destX: findBestField('destX'),
      destY: findBestField('destY')
    };

    // Si on n'a pas trouvé de destination avec les mots-clés,
    // utiliser la logique: 1ère paire = origine, 2ème paire = destination
    if (!result.destX || !result.destY) {
      console.log('No destination found with keywords, using position-based logic');
      
      // Filtrer les champs X et Y
      const xFields = coordinateFields
        .filter(f => f.fieldName.toLowerCase().includes('lon') || f.fieldName.toLowerCase().includes('x'))
        .sort((a, b) => analyses.indexOf(a) - analyses.indexOf(b)); // Garder l'ordre original
      
      const yFields = coordinateFields
        .filter(f => f.fieldName.toLowerCase().includes('lat') || f.fieldName.toLowerCase().includes('y'))
        .sort((a, b) => analyses.indexOf(a) - analyses.indexOf(b)); // Garder l'ordre original

      console.log('Found X fields:', xFields.map(f => f.fieldName));
      console.log('Found Y fields:', yFields.map(f => f.fieldName));

      // Si on a au moins 2 paires de coordonnées
      if (xFields.length >= 2 && yFields.length >= 2) {
        // 1ère paire = origine (si pas déjà trouvée)
        if (!result.originX) result.originX = xFields[0].fieldName;
        if (!result.originY) result.originY = yFields[0].fieldName;
        
        // 2ème paire = destination
        result.destX = xFields[1].fieldName;
        result.destY = yFields[1].fieldName;
      }
    }

    console.log('Final auto-selection:', result);
    return result;
  }
}