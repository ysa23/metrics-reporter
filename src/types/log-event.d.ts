export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type LogEventCode = 
  | 'HARD_LIMIT_REACHED'      // Emergency reset triggered
  | 'SOFT_LIMIT_EXCEEDED'     // Soft reset after scrape
  | 'APPROACHING_SOFT_LIMIT'  // Warning threshold reached
  | 'METRICS_RESET';          // Metrics were reset

export interface LogEvent {
  level: LogLevel;
  code: LogEventCode;
  message: string;
  params?: Record<string, any>;
  timestamp: number;
  reporter?: string;  // Name of the reporter that generated the event
}

export type LogCallback = (event: LogEvent) => void;