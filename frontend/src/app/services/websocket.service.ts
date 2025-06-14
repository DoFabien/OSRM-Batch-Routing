import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface WebSocketMessage {
  type: 'job_update' | 'error' | 'connection';
  jobId?: string;
  data?: any;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: Socket | null = null;
  private messageSubject = new Subject<WebSocketMessage>();
  private connectionSubject = new BehaviorSubject<boolean>(false);

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      const serverUrl = environment.production 
        ? window.location.origin
        : 'http://localhost:3001';
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('Socket.IO connected');
        this.connectionSubject.next(true);
      });

      this.socket.on('job_update', (data: any) => {
        console.log('Received job update:', data);
        this.messageSubject.next({
          type: 'job_update',
          jobId: data.jobId,
          data: data.data
        });
      });

      this.socket.on('disconnect', () => {
        console.log('Socket.IO disconnected');
        this.connectionSubject.next(false);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        this.messageSubject.next({
          type: 'error',
          message: 'Socket.IO connection error'
        });
      });

    } catch (error) {
      console.error('Failed to create Socket.IO connection:', error);
    }
  }

  public subscribeToJob(jobId: string): void {
    if (this.socket && this.socket.connected) {
      console.log(`Subscribing to job: ${jobId}`);
      this.socket.emit('subscribe', jobId);
    }
  }

  public unsubscribeFromJob(jobId: string): void {
    if (this.socket && this.socket.connected) {
      console.log(`Unsubscribing from job: ${jobId}`);
      this.socket.emit('unsubscribe', jobId);
    }
  }

  public getMessages(): Observable<WebSocketMessage> {
    return this.messageSubject.asObservable();
  }

  public getConnectionStatus(): Observable<boolean> {
    return this.connectionSubject.asObservable();
  }

  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionSubject.next(false);
  }
}