import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { ApiService, JobStatus, JobResults, JobMetadata } from '../../services/api.service';
import { WebSocketService, WebSocketMessage } from '../../services/websocket.service';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-job-monitor',
  imports: [
    CommonModule,
    MatCardModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule
  ],
  template: `
    <div *ngIf="!jobId" class="no-job">
      <p>No job ID provided. Current jobId: "{{ jobId }}"</p>
    </div>
    
    <mat-card *ngIf="jobId">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>trending_up</mat-icon>
          Job Monitor
        </mat-card-title>
        <mat-card-subtitle>
          Tracking job: {{ jobId }}
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <div *ngIf="jobStatus" class="job-details">
          <div class="status-header">
            <mat-chip-set>
              <mat-chip [color]="getStatusColor(jobStatus.status)" selected>
                <mat-icon>{{ getStatusIcon(jobStatus.status) }}</mat-icon>
                {{ jobStatus.status.toUpperCase() }}
              </mat-chip>
            </mat-chip-set>
            
            <div class="timestamp" *ngIf="jobStatus.startedAt">
              Started: {{ formatTimestamp(jobStatus.startedAt) }}
            </div>
          </div>

          <div class="progress-section" *ngIf="jobStatus.progress">
            <div class="progress-info">
              <span>Progress: {{ jobStatus.progress.processed }} / {{ jobStatus.progress.total }}</span>
              <span class="percentage">{{ getProgressPercentage() }}%</span>
            </div>
            
            <mat-progress-bar 
              mode="determinate" 
              [value]="getProgressPercentage()">
            </mat-progress-bar>

            <div class="progress-details">
              <div class="success-count">
                <mat-icon color="primary">check_circle</mat-icon>
                Successful: {{ jobStatus.progress.successful }}
              </div>
              <div class="failed-count" *ngIf="jobStatus.progress.failed > 0">
                <mat-icon color="warn">error</mat-icon>
                Failed: {{ jobStatus.progress.failed }}
              </div>
            </div>
          </div>

          <div class="completion-info" *ngIf="jobStatus.status === 'completed' && jobStatus.completedAt">
            <mat-icon color="primary">done</mat-icon>
            <span>Completed at {{ formatTimestamp(jobStatus.completedAt) }}</span>
            <span class="duration">({{ getDuration() }})</span>
          </div>

          <div class="error-info" *ngIf="jobStatus.status === 'failed' && jobStatus.error">
            <mat-icon color="warn">error</mat-icon>
            <span>Error: {{ jobStatus.error }}</span>
          </div>
        </div>

        <!-- Job Summary/Metadata -->
        <div *ngIf="jobStatus?.status === 'completed' && jobMetadata" class="metadata-section">
          <h4>
            <mat-icon>assessment</mat-icon>
            Job Summary
          </h4>
          
          <div class="metadata-grid">
            <div class="metadata-item">
              <mat-icon color="primary">map</mat-icon>
              <div class="metadata-content">
                <span class="metadata-label">Total Features</span>
                <span class="metadata-value">{{ jobMetadata.summary.successful }}</span>
              </div>
            </div>
            
            <div class="metadata-item">
              <mat-icon color="primary">straighten</mat-icon>
              <div class="metadata-content">
                <span class="metadata-label">Total Distance</span>
                <span class="metadata-value">{{ formatDistance(jobMetadata.summary.totalDistance) }}</span>
              </div>
            </div>
            
            <div class="metadata-item">
              <mat-icon color="primary">schedule</mat-icon>
              <div class="metadata-content">
                <span class="metadata-label">Total Duration</span>
                <span class="metadata-value">{{ formatDuration(jobMetadata.summary.totalDuration) }}</span>
              </div>
            </div>
            
            <div class="metadata-item">
              <mat-icon color="primary">event</mat-icon>
              <div class="metadata-content">
                <span class="metadata-label">Generated At</span>
                <span class="metadata-value">{{ formatTimestamp(jobMetadata.generatedAt) }}</span>
              </div>
            </div>
            
            <div class="metadata-item">
              <mat-icon color="primary">speed</mat-icon>
              <div class="metadata-content">
                <span class="metadata-label">Calculations/Second</span>
                <span class="metadata-value">{{ getCalculationsPerSecond() }}</span>
              </div>
            </div>
            
            <div class="metadata-item" *ngIf="jobMetadata.jobTiming?.durationSeconds">
              <mat-icon color="primary">timer</mat-icon>
              <div class="metadata-content">
                <span class="metadata-label">Processing Time</span>
                <span class="metadata-value">{{ jobMetadata.jobTiming!.durationSeconds }}s</span>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="loadingMetadata" class="loading-placeholder">
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          <p>Loading job summary...</p>
        </div>

        <div *ngIf="loading" class="loading-placeholder">
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          <p>Loading job status...</p>
        </div>
      </mat-card-content>

      <mat-card-actions align="end" *ngIf="jobStatus">
        <button mat-button 
                color="warn"
                *ngIf="jobStatus.status === 'processing' || jobStatus.status === 'pending'"
                (click)="cancelJob()">
          <mat-icon>cancel</mat-icon>
          Cancel Job
        </button>
        
        <button mat-button (click)="refreshStatus()">
          <mat-icon>refresh</mat-icon>
          Refresh
        </button>
        
        <button mat-raised-button 
                color="primary"
                (click)="downloadGeoJSON()"
                [disabled]="jobStatus.status !== 'completed'">
          <mat-icon>download</mat-icon>
          Download GeoJSON
        </button>
        
        <button mat-raised-button 
                color="primary"
                (click)="downloadGeoPackage()"
                [disabled]="jobStatus.status !== 'completed'">
          <mat-icon>download</mat-icon>
          Download GeoPackage
        </button>
        
        <button mat-raised-button 
                color="accent"
                *ngIf="jobStatus.status === 'completed' || jobStatus.status === 'failed'"
                (click)="startNewJob()">
          <mat-icon>add</mat-icon>
          New Job
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .job-details {
      padding: 1rem 0;
    }

    .status-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .timestamp {
      color: #666;
      font-size: 0.9em;
    }

    .progress-section {
      margin: 1.5rem 0;
    }

    .progress-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .percentage {
      font-weight: bold;
      color: #1976d2;
    }

    .progress-details {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
      align-items: center;
    }

    .success-count, .failed-count {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .completion-info, .error-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: 4px;
      margin-top: 1rem;
    }

    .completion-info {
      background-color: #e8f5e8;
      color: #2e7d32;
    }

    .error-info {
      background-color: #ffebee;
      color: #c62828;
    }

    .duration {
      color: #666;
      font-style: italic;
    }

    .loading-placeholder {
      text-align: center;
      padding: 2rem 0;
    }

    .loading-placeholder p {
      margin-top: 1rem;
      color: #666;
    }

    .no-job {
      padding: 2rem;
      text-align: center;
      color: #666;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin: 1rem 0;
    }

    mat-card-header mat-icon {
      margin-right: 0.5rem;
    }

    mat-chip mat-icon {
      margin-right: 0.3rem;
    }

    .metadata-section {
      margin-top: 2rem;
      padding: 1.5rem;
      background-color: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #1976d2;
    }

    .metadata-section h4 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 1.5rem 0;
      color: #1976d2;
      font-size: 1.1rem;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
    }

    .metadata-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background-color: white;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .metadata-content {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .metadata-label {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 0.25rem;
    }

    .metadata-value {
      font-size: 1.1rem;
      font-weight: 600;
      color: #333;
    }

    @media (max-width: 768px) {
      .status-header {
        flex-direction: column;
        gap: 1rem;
        align-items: flex-start;
      }

      .progress-details {
        flex-direction: column;
        gap: 0.5rem;
        align-items: flex-start;
      }

      .metadata-grid {
        grid-template-columns: 1fr;
      }

      .metadata-section {
        padding: 1rem;
      }
    }
  `]
})
export class JobMonitorComponent implements OnInit, OnDestroy, OnChanges {
  @Input() jobId: string = '';
  @Output() newJobRequested = new EventEmitter<void>();

  jobStatus: JobStatus | null = null;
  jobMetadata: JobMetadata | null = null;
  loading = false;
  loadingMetadata = false;
  private statusSubscription?: Subscription;
  private websocketSubscription?: Subscription;

  constructor(
    private apiService: ApiService,
    private snackBar: MatSnackBar,
    private websocketService: WebSocketService,
    private sessionService: SessionService
  ) {}

  ngOnInit() {
    console.log('JobMonitor ngOnInit - jobId:', this.jobId);
    if (this.jobId) {
      this.startMonitoring();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('JobMonitor ngOnChanges - changes:', changes);
    if (changes['jobId'] && changes['jobId'].currentValue) {
      console.log('JobMonitor - new jobId:', changes['jobId'].currentValue);
      this.stopMonitoring();
      this.jobStatus = null;
      this.startMonitoring();
    }
  }

  ngOnDestroy() {
    this.stopMonitoring();
  }

  private startMonitoring() {
    console.log('JobMonitor - startMonitoring for jobId:', this.jobId);
    
    // Get initial status
    this.refreshStatus();
    
    // Subscribe to WebSocket updates for this job (handles connection state internally)
    this.websocketService.subscribeToJob(this.jobId);
    
    // Listen for WebSocket messages
    this.websocketSubscription = this.websocketService.getMessages().subscribe({
      next: (message: WebSocketMessage) => {
        console.log('JobMonitor received WebSocket message:', message);
        if (message.jobId === this.jobId && message.type === 'job_update') {
          this.handleWebSocketUpdate(message.data);
        }
      },
      error: (error) => {
        console.error('WebSocket error:', error);
        // Fallback to polling if WebSocket fails
        this.fallbackToPolling();
      }
    });
  }

  private stopMonitoring() {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }
    if (this.websocketSubscription) {
      this.websocketSubscription.unsubscribe();
    }
    if (this.jobId) {
      this.websocketService.unsubscribeFromJob(this.jobId);
    }
  }

  private handleWebSocketUpdate(data: any) {
    if (data.progress) {
      // Update progress in real-time
      if (this.jobStatus) {
        this.jobStatus.progress = data.progress;
      }
    }
    
    if (data.status) {
      // Update status in real-time
      if (this.jobStatus) {
        this.jobStatus.status = data.status;
        
        // Handle job completion
        if (data.status === 'completed') {
          this.sessionService.clearCurrentJob();
          this.sessionService.addCompletedJob(this.jobId);
        }
        
        // Load metadata when job is completed
        if (data.status === 'completed') {
          this.loadJobMetadata();
        }
      }
    }
  }

  private fallbackToPolling() {
    console.warn('Falling back to polling due to WebSocket issues');
    // Only poll if job is still running
    if (this.jobStatus?.status === 'pending' || this.jobStatus?.status === 'processing') {
      this.statusSubscription = this.websocketService.getConnectionStatus().subscribe(connected => {
        if (!connected) {
          // Poll every 5 seconds as fallback
          setTimeout(() => this.refreshStatus(), 5000);
        }
      });
    }
  }

  refreshStatus() {
    console.log('JobMonitor - refreshStatus for jobId:', this.jobId);
    this.loading = true;
    
    this.apiService.getJobStatus(this.jobId).subscribe({
      next: (response) => {
        console.log('JobMonitor - status response:', response);
        this.loading = false;
        if (response.success) {
          this.jobStatus = response.data;
          console.log('JobMonitor - jobStatus updated:', this.jobStatus);
          
          // Stop polling if job is completed or failed
          if (this.jobStatus.status === 'completed' || this.jobStatus.status === 'failed') {
            this.stopMonitoring();
            
            // Load metadata when job is completed
            if (this.jobStatus.status === 'completed') {
              this.loadJobMetadata();
            }
          }
        }
      },
      error: (error) => {
        console.error('JobMonitor - status error:', error);
        this.loading = false;
        this.snackBar.open('Failed to get job status', 'Close', {
          duration: 3000
        });
      }
    });
  }

  getProgressPercentage(): number {
    if (!this.jobStatus?.progress) return 0;
    
    const { processed, total } = this.jobStatus.progress;
    return total > 0 ? Math.round((processed / total) * 100) : 0;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'primary';
      case 'failed': return 'warn';
      case 'processing': return 'accent';
      default: return '';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return 'check_circle';
      case 'failed': return 'error';
      case 'processing': return 'hourglass_empty';
      default: return 'schedule';
    }
  }

  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  getDuration(): string {
    if (!this.jobStatus?.startedAt || !this.jobStatus?.completedAt) {
      return '';
    }

    const start = new Date(this.jobStatus.startedAt);
    const end = new Date(this.jobStatus.completedAt);
    const durationMs = end.getTime() - start.getTime();
    
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getCalculationsPerMinute(): string {
    if (!this.jobStatus?.startedAt || !this.jobStatus?.completedAt || !this.jobMetadata?.summary?.successful) {
      return 'N/A';
    }

    const start = new Date(this.jobStatus.startedAt);
    const end = new Date(this.jobStatus.completedAt);
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    
    if (durationMinutes === 0) {
      return 'N/A';
    }

    const calculationsPerMinute = this.jobMetadata.summary.successful / durationMinutes;
    return Math.round(calculationsPerMinute).toLocaleString();
  }

  getCalculationsPerSecond(): string {
    if (!this.jobMetadata?.summary?.successful || !this.jobMetadata?.jobTiming?.durationSeconds) {
      return 'N/A';
    }
    
    if (this.jobMetadata.jobTiming.durationSeconds === 0) {
      return 'N/A';
    }

    const calculationsPerSecond = this.jobMetadata.summary.successful / this.jobMetadata.jobTiming.durationSeconds;
    return calculationsPerSecond.toFixed(1);
  }


  loadJobMetadata() {
    console.log('JobMonitor - loadJobMetadata for jobId:', this.jobId);
    this.loadingMetadata = true;
    
    this.apiService.getJobMetadata(this.jobId).subscribe({
      next: (metadata) => {
        console.log('JobMonitor - metadata loaded:', metadata);
        this.loadingMetadata = false;
        this.jobMetadata = metadata;
      },
      error: (error) => {
        console.error('JobMonitor - metadata error:', error);
        this.loadingMetadata = false;
      }
    });
  }

  downloadGeoJSON() {
    if (this.jobStatus?.status !== 'completed') return;

    this.apiService.exportJobAsGeoJSON(this.jobId).subscribe({
      next: (geoJSON) => {
        const blob = new Blob([JSON.stringify(geoJSON, null, 2)], {
          type: 'application/json'
        });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `routing-results-${this.jobId}.geojson`;
        link.click();
        
        window.URL.revokeObjectURL(url);
        
        this.snackBar.open('GeoJSON downloaded successfully!', 'Close', {
          duration: 3000
        });
      },
      error: (error) => {
        this.snackBar.open('Failed to download GeoJSON', 'Close', {
          duration: 3000
        });
      }
    });
  }

  downloadGeoPackage() {
    if (this.jobStatus?.status !== 'completed') return;

    this.snackBar.open('Preparing GeoPackage download...', 'Close', {
      duration: 2000
    });

    this.apiService.exportJobAsGeoPackage(this.jobId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `routing-results-${this.jobId}.gpkg`;
        link.click();
        
        window.URL.revokeObjectURL(url);
        
        this.snackBar.open('GeoPackage downloaded successfully!', 'Close', {
          duration: 3000
        });
      },
      error: (error) => {
        console.error('GeoPackage download error:', error);
        this.snackBar.open('Failed to download GeoPackage', 'Close', {
          duration: 3000
        });
      }
    });
  }

  formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
  
  cancelJob() {
    if (!this.jobId || !this.jobStatus) return;
    
    if (confirm('Are you sure you want to cancel this job? All data will be lost.')) {
      this.apiService.cancelJob(this.jobId).subscribe({
        next: (response) => {
          if (response.success) {
            this.snackBar.open('Job cancelled successfully', 'Close', {
              duration: 3000
            });
            
            // Clear session
            this.sessionService.clearCurrentJob();
            
            // Update local status
            if (this.jobStatus) {
              this.jobStatus.status = 'failed';
              this.jobStatus.error = 'Job cancelled by user';
            }
          } else {
            this.snackBar.open('Failed to cancel job', 'Close', {
              duration: 3000
            });
          }
        },
        error: () => {
          this.snackBar.open('Failed to cancel job', 'Close', {
            duration: 3000
          });
        }
      });
    }
  }
  
  startNewJob() {
    if (confirm('Are you sure you want to start a new job? This will clean up current data.')) {
      console.log('Starting new job, cleaning up current session');
      
      // Clean up current job if it exists
      if (this.jobId && this.jobStatus?.status === 'completed') {
        this.apiService.cleanupJob(this.jobId).subscribe({
          next: () => {
            console.log('Job cleanup completed');
          },
          error: (error) => {
            console.warn('Failed to cleanup job:', error);
          }
        });
      }
      
      // Clear session
      this.sessionService.clearCurrentJob();
      
      // Emit event to parent to reset application
      this.newJobRequested.emit();
    }
  }
}