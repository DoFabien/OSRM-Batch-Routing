import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface Projection {
  code: string;
  nom: string;
  proj4: string;
  region: string;
  datum: string;
  link: string;
}

export interface FileUploadResponse {
  success: boolean;
  data: {
    id: string;
    filename: string;
    mimetype: string;
    size: number;
    uploadedAt: string;
    headers: string[];
    rowCount: number;
    encoding: string;
    separator: string;
  };
}

export interface FileSampleResponse {
  success: boolean;
  data: {
    headers: string[];
    sample: Record<string, string>[];
    totalRows: number;
  };
}

export interface BatchJobConfig {
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
    straightLineGeometry: boolean;
    simplifyGeometry: boolean;
    simplificationTolerance?: number;
  };
}

export interface BatchJobResponse {
  success: boolean;
  data: {
    jobId: string;
  };
}

export interface JobStatus {
  id: string;
  fileId: string;
  configuration: BatchJobConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    processed: number;
    successful: number;
    failed: number;
  };
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface RouteResult {
  rowIndex: number;
  originalData: Record<string, string>;
  success: boolean;
  route?: {
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
    };
  };
  error?: string;
}

export interface JobResults {
  jobId: string;
  status: string;
  results: RouteResult[];
}

export interface JobMetadata {
  jobId: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalDistance: number;
    totalDuration: number;
  };
  generatedAt: string;
  configuration?: {
    projection?: any;
    originFields?: any;
    destinationFields?: any;
    geometryOptions?: any;
  };
  jobTiming?: {
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    durationSeconds: number;
  };
  files: {
    geojson: string;
    metadata: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = this.getBaseUrl();

  constructor(private http: HttpClient) {
    console.log('API Service initialized with base URL:', this.baseUrl);
  }

  private getBaseUrl(): string {
    // En production, utilise l'URL relative, en développement localhost:3001
    // Détecte si on est en développement Angular (port 4200)
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
        && window.location.port === '4200') {
      return 'http://localhost:3001/api';
    }
    return '/api';
  }

  getProjections(): Observable<{ success: boolean; data: Projection[] }> {
    return this.http.get<{ success: boolean; data: Projection[] }>(`${this.baseUrl}/projections`);
  }

  uploadFile(file: File): Observable<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post<FileUploadResponse>(`${this.baseUrl}/upload`, formData);
  }

  getFileSample(fileId: string, limit: number = 10): Observable<FileSampleResponse> {
    return this.http.get<FileSampleResponse>(`${this.baseUrl}/upload/${fileId}/sample?limit=${limit}`);
  }

  createBatchJob(config: BatchJobConfig): Observable<BatchJobResponse> {
    return this.http.post<BatchJobResponse>(`${this.baseUrl}/routing/batch`, config);
  }

  getJobStatus(jobId: string): Observable<{ success: boolean; data: JobStatus }> {
    return this.http.get<{ success: boolean; data: JobStatus }>(`${this.baseUrl}/routing/status/${jobId}`);
  }

  getJobResults(jobId: string): Observable<{ success: boolean; data: JobResults }> {
    return this.http.get<{ success: boolean; data: JobResults }>(`${this.baseUrl}/routing/results/${jobId}`);
  }

  exportJobAsGeoJSON(jobId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/routing/export/${jobId}`);
  }

  exportJobAsGeoPackage(jobId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/routing/export/${jobId}/geopackage`, {
      responseType: 'blob'
    });
  }

  getJobMetadata(jobId: string): Observable<JobMetadata | null> {
    return this.http.get<JobMetadata>(`${this.baseUrl}/routing/metadata/${jobId}`).pipe(
      catchError(() => of(null))
    );
  }

  checkHealth(): Observable<any> {
    return this.http.get(`${this.baseUrl}/health`);
  }
  
  cancelJob(jobId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/routing/job/${jobId}`);
  }
  
  cleanupJob(jobId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/routing/job/${jobId}/cleanup`);
  }
}