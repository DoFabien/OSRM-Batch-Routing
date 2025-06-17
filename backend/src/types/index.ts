import type { LineString } from 'geojson';

export interface Projection {
  code: string;
  nom: string;
  proj4: string;
  region: string;
  datum: string;
  link: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  headers: string[];
  rowCount: number;
  encoding: string;
  separator: string;
  decimalSeparator: '.' | ',';
}

export interface RouteConfiguration {
  fileId: string;
  projection: Projection;
  originFields: {
    x: string;
    y: string;
  };
  destinationFields: {
    x: string;
    y: string;
  };
  geometryOptions?: {
    exportGeometry: boolean;
    simplifyGeometry: boolean;
    simplificationTolerance?: number;
    straightLineGeometry: boolean;
  };
  outputFormat?: string;
}

export interface BatchJob {
  id: string;
  fileId: string;
  configuration: RouteConfiguration;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    processed: number;
    successful: number;
    failed: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  geoPackagePath?: string; // Chemin vers le GeoPackage créé pour ce job
}

export interface RouteResult {
  rowIndex: number;
  originalData: Record<string, string>;
  success: boolean;
  route?: {
    distance: number;
    duration: number;
    geometry: LineString;
  };
  error?: string;
}

export interface BatchResult {
  jobId: string;
  status: 'completed' | 'failed';
  results: RouteResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalDistance: number;
    totalDuration: number;
    jobDurationMs?: number;
    jobDurationSeconds?: number;
  };
}

export interface OSRMResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: LineString;
  }>;
  message?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface GeographicBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface CoordinateValidationResult {
  isValid: boolean;
  invalidCount: number;
  invalidRows: Array<{
    rowIndex: number;
    lat: number;
    lon: number;
    reason: string;
  }>;
  bounds: GeographicBounds;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: ValidationError[];
  details?: string;
}

export interface WebSocketMessage {
  type: 'job_progress' | 'job_completed' | 'job_failed';
  jobId: string;
  data: unknown;
}