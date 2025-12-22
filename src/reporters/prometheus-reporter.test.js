const { PrometheusReporter } = require('./prometheus-reporter');

describe('PrometheusReporter', () => {
  describe('constructor', () => {
    it('should create a reporter with default configuration', () => {
      const reporter = new PrometheusReporter();
      expect(reporter).toBeDefined();
      expect(typeof reporter.getMetrics).toBe('function');
      expect(typeof reporter.increment).toBe('function');
      expect(typeof reporter.value).toBe('function');
      expect(typeof reporter.report).toBe('function');
    });

    it('should accept configuration options', () => {
      const reporter = new PrometheusReporter({
        prefix: 'test_',
        softLimit: 1000,
        hardLimit: 2000,
        warnAt: 800
      });
      expect(reporter).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return empty string when no metrics exist', () => {
      const reporter = new PrometheusReporter();
      const output = reporter.getMetrics();
      expect(output).toBe('');
    });
  });

  describe('increment', () => {
    it('should track single counter metric', () => {
      const reporter = new PrometheusReporter();
      reporter.increment('test_counter', 1);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP test_counter Counter metric\n' +
        '# TYPE test_counter counter\n' +
        'test_counter_total 1\n'
      );
    });

    it('should accumulate counter values for same metric', () => {
      const reporter = new PrometheusReporter();
      reporter.increment('test_counter', 5);
      reporter.increment('test_counter', 3);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP test_counter Counter metric\n' +
        '# TYPE test_counter counter\n' +
        'test_counter_total 8\n'
      );
    });

    it('should handle tags correctly with sorted labels', () => {
      const reporter = new PrometheusReporter();
      reporter.increment('test_counter', 1, { status: '200', method: 'GET' });

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP test_counter Counter metric\n' +
        '# TYPE test_counter counter\n' +
        'test_counter_total{method="GET",status="200"} 1\n'
      );
    });

    it('should track different tag combinations separately', () => {
      const reporter = new PrometheusReporter();
      reporter.increment('requests', 1, { method: 'GET' });
      reporter.increment('requests', 2, { method: 'POST' });

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP requests Counter metric\n' +
        '# TYPE requests counter\n' +
        'requests_total{method="GET"} 1\n' +
        'requests_total{method="POST"} 2\n'
      );
    });

    it('should handle increment with default value of 1', () => {
      const reporter = new PrometheusReporter();
      reporter.increment('test_counter');

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP test_counter Counter metric\n' +
        '# TYPE test_counter counter\n' +
        'test_counter_total 1\n'
      );
    });

    it('should call logCallback when warning threshold reached', () => {
      const logCallback = jest.fn();
      const reporter = new PrometheusReporter({ warnAt: 2, softLimit: 4, logCallback });
      reporter.increment('metric1', 1);
      reporter.increment('metric2', 2);
      reporter.increment('metric3', 3);

      expect(logCallback).toHaveBeenCalledTimes(1);
      expect(logCallback).toHaveBeenCalledWith({
        level: 'warn',
        code: 'APPROACHING_SOFT_LIMIT',
        message: 'Approaching soft limit',
        params: {
          softLimit: 4,
          warnAt: 2,
          size: 2,
        },
        timestamp: expect.any(Number),
        reporter: 'PrometheusReporter',
      });
    });
  });

  describe('value (gauge)', () => {
    it('should track gauge metrics', () => {
      const reporter = new PrometheusReporter();
      reporter.value('memory_usage', 1024);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP memory_usage Gauge metric\n' +
        '# TYPE memory_usage gauge\n' +
        'memory_usage 1024\n'
      );
    });

    it('should update gauge values (not accumulate)', () => {
      const reporter = new PrometheusReporter();
      reporter.value('memory_usage', 1024);
      reporter.value('memory_usage', 2048);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP memory_usage Gauge metric\n' +
        '# TYPE memory_usage gauge\n' +
        'memory_usage 2048\n'
      );
    });

    it('should handle gauge with tags', () => {
      const reporter = new PrometheusReporter();
      reporter.value('temperature', 23.5, { location: 'server_room' });

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP temperature Gauge metric\n' +
        '# TYPE temperature gauge\n' +
        'temperature{location="server_room"} 23.5\n'
      );
    });
  });

  describe('report (histogram)', () => {
    it('should track histogram metrics with default buckets', () => {
      const reporter = new PrometheusReporter();
      reporter.report('response_time', 150);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP response_time Histogram metric\n' +
        '# TYPE response_time histogram\n' +
        'response_time_bucket{le="10"} 0\n' +
        'response_time_bucket{le="50"} 0\n' +
        'response_time_bucket{le="100"} 0\n' +
        'response_time_bucket{le="250"} 1\n' +
        'response_time_bucket{le="500"} 1\n' +
        'response_time_bucket{le="1000"} 1\n' +
        'response_time_bucket{le="2500"} 1\n' +
        'response_time_bucket{le="5000"} 1\n' +
        'response_time_bucket{le="10000"} 1\n' +
        'response_time_bucket{le="+Inf"} 1\n' +
        'response_time_sum 150\n' +
        'response_time_count 1\n'
      );
    });

    it('should accumulate histogram observations correctly', () => {
      const reporter = new PrometheusReporter();
      reporter.report('response_time', 50);  // Goes in 50, 100, etc buckets
      reporter.report('response_time', 150); // Goes in 250, 500, etc buckets

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP response_time Histogram metric\n' +
        '# TYPE response_time histogram\n' +
        'response_time_bucket{le="10"} 0\n' +
        'response_time_bucket{le="50"} 1\n' +
        'response_time_bucket{le="100"} 1\n' +
        'response_time_bucket{le="250"} 2\n' +
        'response_time_bucket{le="500"} 2\n' +
        'response_time_bucket{le="1000"} 2\n' +
        'response_time_bucket{le="2500"} 2\n' +
        'response_time_bucket{le="5000"} 2\n' +
        'response_time_bucket{le="10000"} 2\n' +
        'response_time_bucket{le="+Inf"} 2\n' +
        'response_time_sum 200\n' +
        'response_time_count 2\n'
      );
    });

    it('should handle histogram with custom buckets', () => {
      const reporter = new PrometheusReporter({
        buckets: [1, 5, 10]
      });
      reporter.report('custom_metric', 3);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP custom_metric Histogram metric\n' +
        '# TYPE custom_metric histogram\n' +
        'custom_metric_bucket{le="1"} 0\n' +
        'custom_metric_bucket{le="5"} 1\n' +
        'custom_metric_bucket{le="10"} 1\n' +
        'custom_metric_bucket{le="+Inf"} 1\n' +
        'custom_metric_sum 3\n' +
        'custom_metric_count 1\n'
      );
    });
  });

  describe('soft limit behavior', () => {
    it('should reset metrics after scrape when soft limit exceeded', () => {
      const reporter = new PrometheusReporter({ softLimit: 2 });

      // Add metrics beyond soft limit
      reporter.increment('metric1', 1);
      reporter.increment('metric2', 1);
      reporter.increment('metric3', 1);

      // First scrape should return all metrics
      const output1 = reporter.getMetrics();
      const expectedOutput1 =
        '# HELP metric1 Counter metric\n' +
        '# TYPE metric1 counter\n' +
        'metric1_total 1\n' +
        '# HELP metric2 Counter metric\n' +
        '# TYPE metric2 counter\n' +
        'metric2_total 1\n' +
        '# HELP metric3 Counter metric\n' +
        '# TYPE metric3 counter\n' +
        'metric3_total 1\n';

      expect(output1).toBe(expectedOutput1);

      // Second scrape should be empty (metrics were reset)
      const output2 = reporter.getMetrics();
      expect(output2).toBe('');
    });

    it('should not reset metrics when under soft limit', () => {
      const reporter = new PrometheusReporter({ softLimit: 5 });

      reporter.increment('metric1', 1);
      reporter.increment('metric2', 1);

      const output1 = reporter.getMetrics();
      const output2 = reporter.getMetrics();

      // Should be the same both times
      const expectedOutput =
        '# HELP metric1 Counter metric\n' +
        '# TYPE metric1 counter\n' +
        'metric1_total 1\n' +
        '# HELP metric2 Counter metric\n' +
        '# TYPE metric2 counter\n' +
        'metric2_total 1\n';

      expect(output1).toBe(expectedOutput);
      expect(output2).toBe(expectedOutput);
    });

    it('should call logCallback when soft limit exceeded during getMetrics', () => {
      const logCallback = jest.fn();
      const reporter = new PrometheusReporter({ softLimit: 2, logCallback });

      reporter.increment('metric1', 1);
      reporter.increment('metric2', 1);
      reporter.increment('metric3', 1);

      reporter.getMetrics();

      expect(logCallback).toHaveBeenCalledTimes(1);
      expect(logCallback).toHaveBeenCalledWith({
        level: 'info',
        code: 'SOFT_LIMIT_EXCEEDED',
        message: 'Soft limit exceeded, resetting metrics after scrape',
        params: {
          softLimit: 2,
          size: 3,
        },
        timestamp: expect.any(Number),
        reporter: 'PrometheusReporter',
      });
    });
  });

  describe('hard limit behavior', () => {
    it('should force reset when hard limit exceeded during metric update', () => {
      const reporter = new PrometheusReporter({ hardLimit: 2 });

      // Add metrics up to hard limit
      reporter.increment('metric1', 1);
      reporter.increment('metric2', 1);

      // Adding one more should trigger hard reset
      reporter.increment('metric3', 1);

      // Should only have the last metric
      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP metric3 Counter metric\n' +
        '# TYPE metric3 counter\n' +
        'metric3_total 1\n'
      );
    });

    it('should not trigger hard limit for existing metrics', () => {
      const reporter = new PrometheusReporter({ hardLimit: 2 });

      // Add metrics up to hard limit
      reporter.increment('metric1', 1);
      reporter.increment('metric2', 1);

      // Updating existing metric should not trigger reset
      reporter.increment('metric1', 5);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP metric1 Counter metric\n' +
        '# TYPE metric1 counter\n' +
        'metric1_total 6\n' +
        '# HELP metric2 Counter metric\n' +
        '# TYPE metric2 counter\n' +
        'metric2_total 1\n'
      );
    });

    it('should call logCallback when hard limit exceeded', () => {
      const logCallback = jest.fn();
      const reporter = new PrometheusReporter({ hardLimit: 2, logCallback });

      reporter.increment('metric1', 1);
      reporter.increment('metric2', 1);
      reporter.increment('metric3', 1);

      expect(logCallback).toHaveBeenCalledTimes(1);
      expect(logCallback).toHaveBeenCalledWith({
        level: 'error',
        code: 'HARD_LIMIT_REACHED',
        message: 'Hard limit reached, forcing metrics reset',
        params: {
          hardLimit: 2,
          size: 2,
          attemptedKey: 'metric3',
        },
        timestamp: expect.any(Number),
        reporter: 'PrometheusReporter',
      });
    });
  });

  describe('prefix', () => {
    it('should add prefix to metric names', () => {
      const reporter = new PrometheusReporter({ prefix: 'myapp_' });
      reporter.increment('requests', 1);

      const output = reporter.getMetrics();
      expect(output).toBe(
        '# HELP myapp_requests Counter metric\n' +
        '# TYPE myapp_requests counter\n' +
        'myapp_requests_total 1\n'
      );
    });
  });

  describe('mixed metric types', () => {
    it('should handle multiple metric types correctly', () => {
      const reporter = new PrometheusReporter();
      reporter.increment('http_requests', 10);
      reporter.value('memory_usage', 1024);
      reporter.report('response_time', 150);

      const output = reporter.getMetrics();
      const expectedOutput =
        '# HELP http_requests Counter metric\n' +
        '# TYPE http_requests counter\n' +
        'http_requests_total 10\n' +
        '# HELP memory_usage Gauge metric\n' +
        '# TYPE memory_usage gauge\n' +
        'memory_usage 1024\n' +
        '# HELP response_time Histogram metric\n' +
        '# TYPE response_time histogram\n' +
        'response_time_bucket{le="10"} 0\n' +
        'response_time_bucket{le="50"} 0\n' +
        'response_time_bucket{le="100"} 0\n' +
        'response_time_bucket{le="250"} 1\n' +
        'response_time_bucket{le="500"} 1\n' +
        'response_time_bucket{le="1000"} 1\n' +
        'response_time_bucket{le="2500"} 1\n' +
        'response_time_bucket{le="5000"} 1\n' +
        'response_time_bucket{le="10000"} 1\n' +
        'response_time_bucket{le="+Inf"} 1\n' +
        'response_time_sum 150\n' +
        'response_time_count 1\n';

      expect(output).toBe(expectedOutput);
    });
  });
});
