import {IReporter} from "../types/reporter";
import {Tags} from "../types/tags";

declare interface PrometheusReporterOptions {
  prefix?: string;
  softLimit?: number;
  hardLimit?: number;
  warnAt?: number;
  buckets?: number[];
}

export declare class PrometheusReporter implements IReporter {
  constructor(options?: PrometheusReporterOptions);

  report(key: string, value: number, tags?: Tags): void;
  value(key: string, value: number, tags?: Tags): void;
  increment(key: string, value?: number, tags?: Tags): void;
  getMetrics(): string;
  close(): void;
}