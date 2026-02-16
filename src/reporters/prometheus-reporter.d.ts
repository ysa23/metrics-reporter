import {IReporter} from "../types/reporter";
import {Tags} from "../types/tags";
import {LogCallback} from "../types/log-event";

declare interface PrometheusReporterOptions {
  prefix?: string;
  softLimit?: number;
  hardLimit?: number;
  warnAt?: number;
  buckets?: number[];
  logCallback?: LogCallback;
}

export declare class PrometheusReporter implements IReporter {
  constructor(options?: PrometheusReporterOptions);

  report(key: string, value: number, tags?: Tags): void;
  value(key: string, value: number, tags?: Tags): void;
  increment(key: string, value?: number, tags?: Tags): void;

  getMetrics(): string;
  close(): void;
}
