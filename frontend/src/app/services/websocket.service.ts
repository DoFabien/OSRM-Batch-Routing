import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { SessionService } from './session.service';

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

  constructor(private sessionService: SessionService) {
    this.connect();
  }

  private connect(): void {
    try {
      // Determine server URL - in Docker it should use the same port as the web app
      const serverUrl = this.getServerUrl();
      console.log('🔌 Connecting to WebSocket server:', serverUrl);
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 30000,
        forceNew: true
      });

      this.socket.on('connect', () => {
        console.log('✅ Socket.IO connected successfully');
        console.log('Socket ID:', this.socket?.id);
        console.log('Transport:', this.socket?.io?.engine?.transport?.name);
        this.connectionSubject.next(true);
        
        // Send user ID to server for session association
        const userId = this.sessionService.getUserId();
        this.socket?.emit('identify', { userId });
        console.log('Sent user identification:', userId);
        
        // Process pending subscriptions
        if (this.pendingSubscriptions.size > 0) {
          console.log('Processing pending subscriptions:', Array.from(this.pendingSubscriptions));
          this.pendingSubscriptions.forEach(jobId => {
            this.socket?.emit('subscribe', jobId);
            console.log(`📡 Subscribed to pending job: ${jobId}`);
          });
          this.pendingSubscriptions.clear();
        }
      });

      this.socket.on('job_update', (data: any) => {
        console.log('📊 Received job update:', data);
        this.messageSubject.next({
          type: 'job_update',
          jobId: data.jobId,
          data: data.data
        });
      });

      this.socket.on('disconnect', (reason) => {
        console.log('❌ Socket.IO disconnected:', reason);
        this.connectionSubject.next(false);
      });

      this.socket.on('connect_error', (error: any) => {
        console.error('🔴 Socket.IO connection error:', error);
        console.error('Error details:', {
          message: error.message || 'Unknown error',
          description: error.description || 'No description',
          context: error.context || 'No context',
          type: error.type || 'Unknown type'
        });
        this.messageSubject.next({
          type: 'error',
          message: `Socket.IO connection error: ${error.message || 'Unknown error'}`
        });
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Socket.IO reconnected after', attemptNumber, 'attempts');
        this.connectionSubject.next(true);
      });

      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('🔄 Socket.IO reconnection attempt', attemptNumber);
      });

      this.socket.on('reconnect_error', (error: any) => {
        console.error('🔴 Socket.IO reconnection error:', error);
      });

      // Test connection after a short delay
      setTimeout(() => {
        console.log('🔍 Testing WebSocket connection status:', {
          connected: this.socket?.connected,
          id: this.socket?.id,
          transport: this.socket?.io?.engine?.transport?.name,
          url: serverUrl
        });
      }, 3000);

    } catch (error) {
      console.error('Failed to create Socket.IO connection:', error);
    }
  }

  private getServerUrl(): string {
    // En développement Angular (port 4200), utilise localhost:3001
    // En production ou Docker, utilise l'origine actuelle
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
        && window.location.port === '4200') {
      return 'http://localhost:3001';
    }
    return window.location.origin;
  }

  public subscribeToJob(jobId: string): void {
    if (this.socket && this.socket.connected) {
      console.log(`📡 Subscribing to job: ${jobId}`);
      this.socket.emit('subscribe', jobId);
    } else {
      console.warn(`❌ Cannot subscribe to job ${jobId}: WebSocket not connected`);
      // Store the jobId to subscribe when connected
      this.pendingSubscriptions.add(jobId);
    }
  }
  
  private pendingSubscriptions = new Set<string>();

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