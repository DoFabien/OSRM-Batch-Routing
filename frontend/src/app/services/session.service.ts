import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly USER_ID_KEY = 'osrm_user_id';
  private readonly CURRENT_JOB_KEY = 'osrm_current_job';
  private readonly COMPLETED_JOBS_KEY = 'osrm_completed_jobs';
  
  private userId: string;

  constructor() {
    this.userId = this.initializeUserId();
  }

  /**
   * Initialize or retrieve user ID from localStorage
   */
  private initializeUserId(): string {
    let userId = localStorage.getItem(this.USER_ID_KEY);
    
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem(this.USER_ID_KEY, userId);
      console.log('Created new user ID:', userId);
    } else {
      console.log('Retrieved existing user ID:', userId);
    }
    
    return userId;
  }

  /**
   * Get the current user ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Save current job information
   */
  saveCurrentJob(jobId: string, fileData: any): void {
    const jobInfo = {
      jobId,
      fileData,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(this.CURRENT_JOB_KEY, JSON.stringify(jobInfo));
    console.log('Saved current job:', jobId);
  }

  /**
   * Get current job information
   */
  getCurrentJob(): { jobId: string; fileData: any; timestamp: string } | null {
    const jobInfo = localStorage.getItem(this.CURRENT_JOB_KEY);
    
    if (jobInfo) {
      try {
        return JSON.parse(jobInfo);
      } catch (error) {
        console.error('Failed to parse current job info:', error);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Clear current job
   */
  clearCurrentJob(): void {
    localStorage.removeItem(this.CURRENT_JOB_KEY);
    console.log('Cleared current job');
  }

  /**
   * Add job to completed list
   */
  addCompletedJob(jobId: string): void {
    const completedJobs = this.getCompletedJobs();
    
    if (!completedJobs.includes(jobId)) {
      completedJobs.push(jobId);
      
      // Keep only last 50 completed jobs
      if (completedJobs.length > 50) {
        completedJobs.shift();
      }
      
      localStorage.setItem(this.COMPLETED_JOBS_KEY, JSON.stringify(completedJobs));
      console.log('Added to completed jobs:', jobId);
    }
  }

  /**
   * Get list of completed job IDs
   */
  getCompletedJobs(): string[] {
    const jobs = localStorage.getItem(this.COMPLETED_JOBS_KEY);
    
    if (jobs) {
      try {
        return JSON.parse(jobs);
      } catch (error) {
        console.error('Failed to parse completed jobs:', error);
        return [];
      }
    }
    
    return [];
  }

  /**
   * Check if a job belongs to current user
   */
  isUserJob(jobId: string): boolean {
    const currentJob = this.getCurrentJob();
    const completedJobs = this.getCompletedJobs();
    
    return (currentJob?.jobId === jobId) || completedJobs.includes(jobId);
  }

  /**
   * Clear all session data
   */
  clearSession(): void {
    localStorage.removeItem(this.CURRENT_JOB_KEY);
    localStorage.removeItem(this.COMPLETED_JOBS_KEY);
    console.log('Cleared session data');
  }
}