import { Component, EventEmitter, Output, ViewChild, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { ApiService, FileUploadResponse } from '../../services/api.service';

@Component({
  selector: 'app-file-upload',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule,
    MatSnackBarModule
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>
          <mat-icon>upload_file</mat-icon>
          Upload CSV File
        </mat-card-title>
        <mat-card-subtitle>
          Upload a CSV file with coordinate data for batch routing
        </mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <div class="upload-area" 
             [class.drag-over]="isDragOver"
             (dragover)="onDragOver($event)"
             (dragleave)="onDragLeave($event)"
             (drop)="onDrop($event)"
             (click)="fileInput.click()">
          
          <input #fileInput 
                 type="file" 
                 accept=".csv,.tsv" 
                 (change)="onFileSelected($event)"
                 style="display: none;">
          
          <div class="upload-content">
            <mat-icon class="upload-icon">cloud_upload</mat-icon>
            <p>Drag and drop a CSV file here or click to browse</p>
            <p class="file-info">Supported formats: CSV, TSV</p>
          </div>
        </div>

        <div *ngIf="selectedFile" class="file-preview">
          <mat-icon>description</mat-icon>
          <span>{{ selectedFile.name }}</span>
          <span class="file-size">({{ formatFileSize(selectedFile.size) }})</span>
        </div>

        <mat-progress-bar *ngIf="uploading" mode="indeterminate"></mat-progress-bar>
      </mat-card-content>

      <mat-card-actions align="end" *ngIf="selectedFile && !uploading">
        <button mat-button 
                (click)="clearFile()">
          Clear
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .upload-area {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      margin: 1rem 0;
    }

    .upload-area:hover, .upload-area.drag-over {
      border-color: #3f51b5;
      background-color: #f5f5f5;
    }

    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .upload-icon {
      font-size: 3rem;
      height: 3rem;
      width: 3rem;
      color: #666;
    }

    .file-info {
      color: #666;
      font-size: 0.9em;
      margin: 0;
    }

    .file-preview {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin: 1rem 0;
    }

    .file-size {
      color: #666;
      font-size: 0.9em;
    }

    mat-card-header mat-icon {
      margin-right: 0.5rem;
    }
  `]
})
export class FileUploadComponent implements OnInit {
  @Output() fileUploaded = new EventEmitter<FileUploadResponse['data']>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  selectedFile: File | null = null;
  uploading = false;
  isDragOver = false;

  constructor(
    private apiService: ApiService,
    private snackBar: MatSnackBar
  ) {}
  
  ngOnInit() {
    console.log('FileUploadComponent initialized');
    // Ensure clean state on init
    this.selectedFile = null;
    this.uploading = false;
    this.isDragOver = false;
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File) {
    if (!this.isValidFile(file)) {
      this.snackBar.open('Please select a valid CSV or TSV file', 'Close', {
        duration: 3000
      });
      return;
    }

    this.selectedFile = file;
    // Auto-upload file immediately when selected
    this.uploadFile();
  }

  private isValidFile(file: File): boolean {
    const validTypes = ['text/csv', 'text/tab-separated-values', 'application/csv'];
    const validExtensions = ['.csv', '.tsv'];
    
    return validTypes.includes(file.type) || 
           validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  }

  clearFile() {
    this.selectedFile = null;
    // Reset the file input
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  uploadFile() {
    if (!this.selectedFile) return;

    console.log('Starting upload for file:', this.selectedFile.name);
    this.uploading = true;
    
    this.apiService.uploadFile(this.selectedFile).subscribe({
      next: (response) => {
        console.log('Upload response:', response);
        this.uploading = false;
        if (response.success) {
          this.snackBar.open('File uploaded successfully!', 'Close', {
            duration: 3000
          });
          this.fileUploaded.emit(response.data);
          this.clearFile();
        } else {
          this.snackBar.open('Upload failed', 'Close', {
            duration: 3000
          });
        }
      },
      error: (error) => {
        console.error('Upload error:', error);
        this.uploading = false;
        this.snackBar.open(`Upload failed: ${error.error?.error || error.message}`, 'Close', {
          duration: 5000
        });
      }
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}