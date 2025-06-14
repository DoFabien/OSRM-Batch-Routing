import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { ApiService, Projection, BatchJobConfig, FileUploadResponse } from '../../services/api.service';

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
                <mat-option *ngFor="let header of fileData.headers" [value]="header">
                  {{ header }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Y Coordinate (Latitude)</mat-label>
              <mat-select [(value)]="originY">
                <mat-option *ngFor="let header of fileData.headers" [value]="header">
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
                <mat-option *ngFor="let header of fileData.headers" [value]="header">
                  {{ header }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Y Coordinate (Latitude)</mat-label>
              <mat-select [(value)]="destY">
                <mat-option *ngFor="let header of fileData.headers" [value]="header">
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

    @media (max-width: 768px) {
      .coordinate-fields {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class RoutingConfigComponent implements OnInit {
  @Input() fileData: FileUploadResponse['data'] | null = null;
  @Output() jobStarted = new EventEmitter<string>();

  projections: Projection[] = [];
  selectedProjection: Projection | null = null;
  originX: string = '';
  originY: string = '';
  destX: string = '';
  destY: string = '';
  processing = false;

  constructor(
    private apiService: ApiService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadProjections();
    this.autoSelectFields();
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

    // Use enhanced detection algorithm
    this.originX = this.detectCoordinateField('originX') || '';
    this.originY = this.detectCoordinateField('originY') || '';
    this.destX = this.detectCoordinateField('destX') || '';
    this.destY = this.detectCoordinateField('destY') || '';
  }

  private detectCoordinateField(fieldType: 'originX' | 'originY' | 'destX' | 'destY'): string | null {
    const headers = this.fileData!.headers;
    const patterns = this.getFieldPatterns(fieldType);
    
    // Phase 1: Exact matches with high priority
    for (const pattern of patterns.exact) {
      const match = this.findExactMatch(headers, pattern);
      if (match) return match;
    }
    
    // Phase 2: Partial matches with medium priority
    for (const pattern of patterns.partial) {
      const match = this.findPartialMatch(headers, pattern);
      if (match) return match;
    }
    
    // Phase 3: Regex patterns with lower priority
    for (const pattern of patterns.regex) {
      const match = this.findRegexMatch(headers, pattern);
      if (match) return match;
    }
    
    return null;
  }

  private getFieldPatterns(fieldType: 'originX' | 'originY' | 'destX' | 'destY') {
    const patterns = {
      originX: {
        exact: ['origin_x', 'orig_x', 'start_x', 'source_x', 'from_x', 'x1', 'x_origin', 'x_start', 'x_from', 'lon1', 'longitude1', 'long1', 'lng1'],
        partial: ['origin', 'start', 'source', 'from', 'depart'],
        regex: [/^x[_\-]?(1|orig|start|source|from)/i, /longitude[_\-]?(1|orig|start)/i, /lon[_\-]?(1|orig|start)/i]
      },
      originY: {
        exact: ['origin_y', 'orig_y', 'start_y', 'source_y', 'from_y', 'y1', 'y_origin', 'y_start', 'y_from', 'lat1', 'latitude1'],
        partial: ['origin', 'start', 'source', 'from', 'depart'],
        regex: [/^y[_\-]?(1|orig|start|source|from)/i, /latitude[_\-]?(1|orig|start)/i, /lat[_\-]?(1|orig|start)/i]
      },
      destX: {
        exact: ['dest_x', 'destination_x', 'end_x', 'target_x', 'to_x', 'x2', 'x_dest', 'x_end', 'x_to', 'lon2', 'longitude2', 'long2', 'lng2'],
        partial: ['dest', 'destination', 'end', 'target', 'to', 'arrive'],
        regex: [/^x[_\-]?(2|dest|end|target|to)/i, /longitude[_\-]?(2|dest|end)/i, /lon[_\-]?(2|dest|end)/i]
      },
      destY: {
        exact: ['dest_y', 'destination_y', 'end_y', 'target_y', 'to_y', 'y2', 'y_dest', 'y_end', 'y_to', 'lat2', 'latitude2'],
        partial: ['dest', 'destination', 'end', 'target', 'to', 'arrive'],
        regex: [/^y[_\-]?(2|dest|end|target|to)/i, /latitude[_\-]?(2|dest|end)/i, /lat[_\-]?(2|dest|end)/i]
      }
    };
    
    return patterns[fieldType];
  }

  private findExactMatch(headers: string[], pattern: string): string | null {
    const normalizedHeaders = headers.map(h => h.toLowerCase());
    const index = normalizedHeaders.indexOf(pattern.toLowerCase());
    return index !== -1 ? headers[index] : null;
  }

  private findPartialMatch(headers: string[], pattern: string): string | null {
    // For partial matches, look for headers that contain the pattern and coordinate indicators
    const coordinateIndicators = {
      x: ['x', 'longitude', 'lon', 'long', 'lng'],
      y: ['y', 'latitude', 'lat']
    };
    
    for (const header of headers) {
      const lowerHeader = header.toLowerCase();
      if (lowerHeader.includes(pattern.toLowerCase())) {
        // Check if this header also contains coordinate indicators
        const hasXIndicator = coordinateIndicators.x.some(ind => lowerHeader.includes(ind));
        const hasYIndicator = coordinateIndicators.y.some(ind => lowerHeader.includes(ind));
        
        if (hasXIndicator || hasYIndicator) {
          return header;
        }
      }
    }
    
    return null;
  }

  private findRegexMatch(headers: string[], pattern: RegExp): string | null {
    for (const header of headers) {
      if (pattern.test(header)) {
        return header;
      }
    }
    return null;
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