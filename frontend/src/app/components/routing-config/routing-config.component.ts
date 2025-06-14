import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { ApiService, Projection, BatchJobConfig, FileUploadResponse } from '../../services/api.service';
import { CoordinateDetectionService, CoordinateAnalysis } from '../../services/coordinate-detection.service';

@Component({
  selector: 'app-routing-config',
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule
  ],
  template: `
    <mat-card *ngIf="fileData">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>settings</mat-icon>
          Routing Configuration
        </mat-card-title>
        <mat-card-subtitle>
          Configure the routing parameters for {{ fileData.filename }}
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <div class="file-info">
          <p><strong>File:</strong> {{ fileData.filename }}</p>
          <p><strong>Rows:</strong> {{ fileData.rowCount }}</p>
          <p><strong>Columns:</strong> {{ fileData.headers.join(', ') }}</p>
        </div>

        <div class="config-section">
          <mat-form-field appearance="outline">
            <mat-label>Coordinate System</mat-label>
            <mat-select [(value)]="selectedProjection">
              <mat-option *ngFor="let projection of projections" [value]="projection">
                {{ projection.code }} - {{ projection.nom }} ({{ projection.region }})
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="coordinates-section">
          <h4>Origin Coordinates</h4>
          <div class="coordinate-fields">
            <mat-form-field appearance="outline">
              <mat-label>X Coordinate (Longitude)</mat-label>
              <mat-select [(value)]="originX">
                <mat-option *ngFor="let header of getAvailableHeaders('originX')" [value]="header">
                  {{ header }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Y Coordinate (Latitude)</mat-label>
              <mat-select [(value)]="originY">
                <mat-option *ngFor="let header of getAvailableHeaders('originY')" [value]="header">
                  {{ header }}
                </mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <h4>Destination Coordinates</h4>
          <div class="coordinate-fields">
            <mat-form-field appearance="outline">
              <mat-label>X Coordinate (Longitude)</mat-label>
              <mat-select [(value)]="destX">
                <mat-option *ngFor="let header of getAvailableHeaders('destX')" [value]="header">
                  {{ header }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Y Coordinate (Latitude)</mat-label>
              <mat-select [(value)]="destY">
                <mat-option *ngFor="let header of getAvailableHeaders('destY')" [value]="header">
                  {{ header }}
                </mat-option>
              </mat-select>
            </mat-form-field>
          </div>
        </div>

        <div *ngIf="selectedProjection" class="projection-info">
          <h4>Selected Projection Details</h4>
          <p><strong>Name:</strong> {{ selectedProjection.nom }}</p>
          <p><strong>Region:</strong> {{ selectedProjection.region }}</p>
          <p><strong>Datum:</strong> {{ selectedProjection.datum }}</p>
          <p><strong>Proj4:</strong> <code>{{ selectedProjection.proj4 }}</code></p>
        </div>

        <div class="geometry-options">
          <h4>Export Options</h4>
          <mat-form-field appearance="outline">
            <mat-label>Geometry Type</mat-label>
            <mat-select [(value)]="geometryType">
              <mat-option value="complete">
                <mat-icon>route</mat-icon>
                Complete Geometry
              </mat-option>
              <mat-option value="simplified">
                <mat-icon>show_chart</mat-icon>
                Simplified Geometry
              </mat-option>
              <mat-option value="line">
                <mat-icon>timeline</mat-icon>
                Straight Line
              </mat-option>
            </mat-select>
            <mat-hint>Choose how to export route geometries</mat-hint>
          </mat-form-field>

          <div *ngIf="geometryType === 'simplified'" class="simplification-settings">
            <mat-form-field appearance="outline">
              <mat-label>Simplification Tolerance</mat-label>
              <input matInput type="number" [(ngModel)]="simplificationTolerance" 
                     min="0.00001" max="0.01" step="0.00001">
              <mat-hint>Higher values = more simplification (0.0001 recommended)</mat-hint>
            </mat-form-field>
          </div>
        </div>
      </mat-card-content>

      <mat-card-actions align="end">
        <button mat-button (click)="reset()">
          Reset
        </button>
        <button mat-raised-button 
                color="primary"
                (click)="startRouting()"
                [disabled]="!isConfigValid() || processing">
          <mat-icon>route</mat-icon>
          Start Routing
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .file-info {
      background-color: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
    }

    .file-info p {
      margin: 0.5rem 0;
    }

    .config-section {
      margin-bottom: 1.5rem;
    }

    .coordinates-section h4 {
      margin: 1.5rem 0 1rem 0;
      color: #333;
    }

    .coordinate-fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .projection-info {
      background-color: #e3f2fd;
      padding: 1rem;
      border-radius: 4px;
      margin-top: 1.5rem;
    }

    .projection-info h4 {
      margin-top: 0;
      color: #1976d2;
    }

    .projection-info p {
      margin: 0.5rem 0;
    }

    .projection-info code {
      background-color: #fff;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-family: monospace;
    }

    mat-card-header mat-icon {
      margin-right: 0.5rem;
    }

    .geometry-options {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e0e0e0;
    }

    .geometry-options h4 {
      margin-bottom: 1rem;
      color: #333;
    }

    .simplification-settings {
      margin-top: 1rem;
    }

    @media (max-width: 768px) {
      .coordinate-fields {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class RoutingConfigComponent implements OnInit, OnChanges {
  @Input() fileData: FileUploadResponse['data'] | null = null;
  @Output() jobStarted = new EventEmitter<string>();

  projections: Projection[] = [];
  selectedProjection: Projection | null = null;
  originX: string = '';
  originY: string = '';
  destX: string = '';
  destY: string = '';
  processing = false;
  
  // For coordinate field filtering
  allHeaders: string[] = [];
  coordinateHeaders: string[] = [];
  coordinateAnalysis: CoordinateAnalysis[] = [];
  isAnalyzing = false;
  
  // Geometry options
  geometryType: 'complete' | 'simplified' | 'line' = 'complete';
  simplificationTolerance = 0.0001;

  constructor(
    private apiService: ApiService,
    private snackBar: MatSnackBar,
    private coordinateDetection: CoordinateDetectionService
  ) {}

  ngOnInit() {
    console.log('RoutingConfig ngOnInit - fileData:', this.fileData);
    this.loadProjections();
    this.autoSelectFields();
  }

  ngOnChanges() {
    console.log('RoutingConfig ngOnChanges - fileData:', this.fileData);
    if (this.fileData) {
      this.autoSelectFields();
    }
  }

  private loadProjections() {
    this.apiService.getProjections().subscribe({
      next: (response) => {
        if (response.success) {
          this.projections = response.data;
          // Auto-select WGS84 if available
          const wgs84 = this.projections.find(p => p.code === 'EPSG:4326');
          if (wgs84) {
            this.selectedProjection = wgs84;
          }
        }
      },
      error: (error) => {
        this.snackBar.open('Failed to load projections', 'Close', {
          duration: 3000
        });
      }
    });
  }

  private autoSelectFields() {
    if (!this.fileData) return;

    // Analyze the file data to detect coordinate fields
    this.analyzeCoordinateFields();
  }

  private async analyzeCoordinateFields() {
    if (!this.fileData) {
      console.log('No file data available for coordinate analysis');
      return;
    }

    console.log('Starting coordinate analysis for file:', this.fileData.filename);
    this.isAnalyzing = true;
    
    try {
      // Get sample data from the uploaded file
      console.log('Fetching sample data for file ID:', this.fileData.id);
      const sampleResponse = await this.apiService.getFileSample(this.fileData.id, 10).toPromise();
      
      console.log('Sample response:', sampleResponse);
      
      if (sampleResponse?.success && sampleResponse.data) {
        console.log('Sample data received:', {
          headers: sampleResponse.data.headers,
          sampleCount: sampleResponse.data.sample.length,
          firstRow: sampleResponse.data.sample[0]
        });

        // Analyze the coordinate fields using the data
        this.coordinateAnalysis = this.coordinateDetection.analyzeCoordinateFields(
          sampleResponse.data.headers,
          sampleResponse.data.sample
        );

        console.log('Coordinate analysis results:', this.coordinateAnalysis);

        // Filter to show only coordinate fields
        this.coordinateHeaders = this.coordinateDetection
          .getCoordinateFields(this.coordinateAnalysis, 50)
          .map(analysis => analysis.fieldName);

        console.log('Filtered coordinate headers:', this.coordinateHeaders);

        // Auto-select the best fields
        const autoSelection = this.coordinateDetection.autoSelectBestFields(this.coordinateAnalysis);
        
        console.log('Auto-selection result:', autoSelection);
        
        this.originX = autoSelection.originX || '';
        this.originY = autoSelection.originY || '';
        this.destX = autoSelection.destX || '';
        this.destY = autoSelection.destY || '';

        console.log('Fields assigned:', {
          originX: this.originX,
          originY: this.originY,
          destX: this.destX,
          destY: this.destY
        });

      } else {
        console.warn('Could not get file sample, using header-based detection');
        this.fallbackToHeaderDetection();
      }
    } catch (error) {
      console.error('Error analyzing coordinate fields:', error);
      this.fallbackToHeaderDetection();
    } finally {
      this.isAnalyzing = false;
      console.log('Coordinate analysis completed');
    }
  }

  private fallbackToHeaderDetection() {
    // Fallback to simple header name matching if data analysis fails
    if (!this.fileData) return;

    const headers = this.fileData.headers;
    this.coordinateHeaders = headers.filter(header => this.hasCoordinateKeyword(header));
    
    this.originX = this.findHeaderByPattern(headers, /longitude.*smur|smur.*longitude|origin.*x|x.*origin/i) || '';
    this.originY = this.findHeaderByPattern(headers, /latitude.*smur|smur.*latitude|origin.*y|y.*origin/i) || '';
    this.destX = this.findHeaderByPattern(headers, /longitude.*(aurh|com_aurh)|dest.*x|x.*dest/i) || '';
    this.destY = this.findHeaderByPattern(headers, /latitude.*(aurh|com_aurh)|dest.*y|y.*dest/i) || '';
  }

  private hasCoordinateKeyword(header: string): boolean {
    const lowerHeader = header.toLowerCase();
    const keywords = ['lat', 'latitude', 'lon', 'longitude', 'x', 'y', 'coord'];
    return keywords.some(keyword => lowerHeader.includes(keyword));
  }

  private findHeaderByPattern(headers: string[], pattern: RegExp): string | null {
    return headers.find(header => pattern.test(header)) || null;
  }


  getAvailableHeaders(fieldType: 'originX' | 'originY' | 'destX' | 'destY'): string[] {
    if (!this.fileData) return [];
    
    // Use filtered coordinate headers if available, otherwise fallback to all headers
    const headers = this.coordinateHeaders.length > 0 ? this.coordinateHeaders : this.fileData.headers;
    
    // Show currently selected value even if it would normally be filtered out
    const currentValue = this[fieldType];
    if (currentValue && !headers.includes(currentValue)) {
      return [currentValue, ...headers];
    }
    
    return headers;
  }

  isConfigValid(): boolean {
    return !!(
      this.selectedProjection &&
      this.originX &&
      this.originY &&
      this.destX &&
      this.destY &&
      this.fileData
    );
  }

  reset() {
    this.selectedProjection = this.projections.find(p => p.code === 'EPSG:4326') || null;
    this.autoSelectFields();
  }

  startRouting() {
    if (!this.isConfigValid()) return;

    const config: BatchJobConfig = {
      fileId: this.fileData!.id,
      projection: this.selectedProjection!,
      originFields: {
        x: this.originX,
        y: this.originY
      },
      destinationFields: {
        x: this.destX,
        y: this.destY
      },
      geometryOptions: {
        exportGeometry: true,
        straightLineGeometry: this.geometryType === 'line',
        simplifyGeometry: this.geometryType === 'simplified',
        simplificationTolerance: this.geometryType === 'simplified' ? this.simplificationTolerance : undefined
      }
    };

    this.processing = true;

    this.apiService.createBatchJob(config).subscribe({
      next: (response) => {
        this.processing = false;
        if (response.success) {
          this.snackBar.open('Batch routing job started!', 'Close', {
            duration: 3000
          });
          this.jobStarted.emit(response.data.jobId);
        } else {
          this.snackBar.open('Failed to start routing job', 'Close', {
            duration: 3000
          });
        }
      },
      error: (error) => {
        this.processing = false;
        this.snackBar.open(`Failed to start routing: ${error.error?.error || error.message}`, 'Close', {
          duration: 5000
        });
      }
    });
  }
}