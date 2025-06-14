import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
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
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<WebSocketMessage>();
  private connectionSubject = new BehaviorSubject<boolean>(false);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000; // 5 seconds

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      const wsUrl = environment.production 
        ? `wss://${window.location.host}`
        : 'ws://localhost:3001';
      
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.connectionSubject.next(true);
        this.reconnectAttempts = 0;
      };

      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.messageSubject.next(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.connectionSubject.next(false);
        this.attemptReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.messageSubject.next({
          type: 'error',
          message: 'WebSocket connection error'
        });
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectInterval);
    } else {
      console.error('Max reconnection attempts reached');
      this.messageSubject.next({
        type: 'error',
        message: 'WebSocket connection lost and cannot be restored'
      });
    }
  }

  public subscribeToJob(jobId: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'subscribe',
        jobId: jobId
      }));
    }
  }

  public unsubscribeFromJob(jobId: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'unsubscribe',
        jobId: jobId
      }));
    }
  }

  public getMessages(): Observable<WebSocketMessage> {
    return this.messageSubject.asObservable();
  }

  public getConnectionStatus(): Observable<boolean> {
    return this.connectionSubject.asObservable();
  }

  public isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionSubject.next(false);
  }
}