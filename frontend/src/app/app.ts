import { Component, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { RoutingConfigComponent } from './components/routing-config/routing-config.component';
import { JobMonitorComponent } from './components/job-monitor/job-monitor.component';
import { FileUploadResponse, ApiService } from './services/api.service';
import { SessionService } from './services/session.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatStepperModule,
    FileUploadComponent,
    RoutingConfigComponent,
    JobMonitorComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  @ViewChild('stepper') stepper!: MatStepper;
  
  protected title = 'OSRM Batch Routing';
  
  uploadedFile: FileUploadResponse['data'] | null = null;
  currentJobId: string = '';
  currentStep = 0;

  constructor(
    private sessionService: SessionService,
    private apiService: ApiService
  ) {
    console.log('App component initialized');
  }
  
  ngOnInit() {
    this.checkForActiveSession();
  }
  
  private checkForActiveSession() {
    const currentJob = this.sessionService.getCurrentJob();
    
    if (currentJob) {
      console.log('Found active session:', currentJob);
      
      // Check if job still exists on server
      this.apiService.getJobStatus(currentJob.jobId).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            console.log('Job still exists, recovering session for status:', response.data.status);
            this.uploadedFile = currentJob.fileData;
            this.currentJobId = currentJob.jobId;
            
            // Go directly to monitoring step
            this.currentStep = 2;
            setTimeout(() => {
              if (this.stepper) {
                this.stepper.selectedIndex = 2;
              }
            }, 100);
            
            // If job is completed, move it from current to completed
            if (response.data.status === 'completed') {
              this.sessionService.addCompletedJob(currentJob.jobId);
              this.sessionService.clearCurrentJob();
              console.log('Job completed, moved to completed jobs list');
            }
          } else {
            console.log('Job no longer exists, clearing session');
            this.sessionService.clearCurrentJob();
          }
        },
        error: () => {
          console.log('Failed to check job status, clearing session');
          this.sessionService.clearCurrentJob();
        }
      });
    }
  }

  onFileUploaded(fileData: FileUploadResponse['data']) {
    console.log('File uploaded:', fileData);
    this.uploadedFile = fileData;
    this.currentStep = 1;
    // Auto-advance to next step
    setTimeout(() => {
      if (this.stepper) {
        this.stepper.next();
      }
    }, 100);
  }

  onJobStarted(jobId: string) {
    console.log('App - Job started:', jobId);
    this.currentJobId = jobId;
    this.currentStep = 2;
    console.log('App - currentJobId set to:', this.currentJobId);
    
    // Save job to session
    if (this.uploadedFile) {
      this.sessionService.saveCurrentJob(jobId, this.uploadedFile);
    }
    
    // Auto-advance to monitoring step
    setTimeout(() => {
      if (this.stepper) {
        this.stepper.next();
        console.log('App - stepper advanced to step 2');
      }
    }, 100);
  }

  resetApplication() {
    console.log('Resetting application');
    this.uploadedFile = null;
    this.currentJobId = '';
    this.currentStep = 0;
    this.sessionService.clearCurrentJob();
    
    // Reset stepper to first step
    setTimeout(() => {
      if (this.stepper) {
        this.stepper.selectedIndex = 0;
      }
    }, 100);
  }
}
