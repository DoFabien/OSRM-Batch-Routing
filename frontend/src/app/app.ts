import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { RoutingConfigComponent } from './components/routing-config/routing-config.component';
import { JobMonitorComponent } from './components/job-monitor/job-monitor.component';
import { FileUploadResponse } from './services/api.service';

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
export class App {
  @ViewChild('stepper') stepper!: MatStepper;
  
  protected title = 'OSRM Batch Routing';
  
  uploadedFile: FileUploadResponse['data'] | null = null;
  currentJobId: string = '';
  currentStep = 0;

  constructor() {
    console.log('App component initialized');
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
  }
}
