function PrometheusReporter(options = {}) {
  const {
    prefix = '',
    softLimit = 5000,
    hardLimit = 10000,
    warnAt = 4000,
    buckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  } = options;

  const metrics = new Map();
  let warned = false;

  function formatKey(key, tags) {
    if (!tags || Object.keys(tags).length === 0) {
      return key;
    }
    const sortedTags = Object.keys(tags)
      .sort()
      .map(k => `${k}="${escapeValue(tags[k])}"`)
      .join(',');
    return `${key}{${sortedTags}}`;
  }

  function escapeValue(str) {
    if (typeof str !== 'string') {
      return str;
    }
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  function updateMetric(key, value, type, tags) {
    const metricKey = formatKey(key, tags);

    // HARD LIMIT: Emergency reset to prevent OOM
    if (metrics.size >= hardLimit && !metrics.has(metricKey)) {
      console.error('[PROMETHEUS REPORTER]: Hard limit reached, forcing metrics reset', { hardLimit });
      metrics.clear();
      warned = false;
    }

    // Warning threshold
    if (!warned && metrics.size >= warnAt) {
      console.warn('[PROMETHEUS REPORTER]: Approaching soft limit', { softLimit, size: metrics.size });
      warned = true;
    }

    const existing = metrics.get(metricKey) || createMetric(type);
    updateMetricValue(existing, value, type);
    metrics.set(metricKey, existing);
  }

  function createMetric(type) {
    switch (type) {
      case 'counter':
        return { type, value: 0 };
      case 'gauge':
        return { type, value: 0 };
      case 'histogram':
        return {
          type,
          buckets: new Map(buckets.map(b => [b, 0])),
          sum: 0,
          count: 0,
        };
      default:
        return { type: 'gauge', value: 0 };
    }
  }

  function updateMetricValue(metric, value, type) {
    switch (type) {
      case 'counter':
        metric.value += value;
        break;
      case 'gauge':
        metric.value = value;
        break;
      case 'histogram':
        metric.sum += value;
        metric.count += 1;
        buckets.forEach(bucket => {
          if (value <= bucket) {
            metric.buckets.set(bucket, metric.buckets.get(bucket) + 1);
          }
        });
        break;
    }
  }

  function report(key, value, tags) {
    updateMetric(key, value, 'histogram', tags);
  }

  function _value(key, value, tags) {
    updateMetric(key, value, 'gauge', tags);
  }

  function increment(key, value = 1, tags) {
    updateMetric(key, value, 'counter', tags);
  }

  function getMetrics() {
    const output = [];
    const processedMetrics = new Set();

    metrics.forEach((metric, key) => {
      const { name, labels } = parseKey(key);
      const metricName = prefix + name;

      // Add HELP and TYPE lines once per metric name
      if (!processedMetrics.has(metricName)) {
        output.push(`# HELP ${metricName} ${getHelpText(metric.type)}`);
        output.push(`# TYPE ${metricName} ${metric.type}`);
        processedMetrics.add(metricName);
      }

      // Format the metric value(s)
      output.push(...formatMetricValues(metricName, metric, labels));
    });

    const result = output.join('\n') + (output.length > 0 ? '\n' : '');

    // SOFT LIMIT: Reset after scrape if over threshold
    if (metrics.size > softLimit) {
      console.info('[PROMETHEUS REPORTER]: Soft limit exceeded. Buffer will reset after scrape', { softLimit, size: metrics.size });
      metrics.clear();
      warned = false;
    }

    return result;
  }

  function parseKey(metricKey) {
    const match = metricKey.match(/^([^{]+)(\{.*\})?$/);
    if (!match) {
      return { name: metricKey, labels: '' };
    }
    return {
      name: match[1],
      labels: match[2] || '',
    };
  }

  function formatMetricValues(metricName, metric, labels) {
    const values = [];

    switch (metric.type) {
      case 'counter':
        values.push(`${metricName}_total${labels} ${metric.value}`);
        break;
      case 'gauge':
        values.push(`${metricName}${labels} ${metric.value}`);
        break;
      case 'histogram':
        // Output bucket values
        metric.buckets.forEach((count, bucket) => {
          const bucketLabel = labels ? labels.replace('}', `,le="${bucket}"}`) : `{le="${bucket}"}`;
          values.push(`${metricName}_bucket${bucketLabel} ${count}`);
        });
        // Add +Inf bucket
        const infLabel = labels ? labels.replace('}', ',le="+Inf"}') : '{le="+Inf"}';
        values.push(`${metricName}_bucket${infLabel} ${metric.count}`);
        // Add sum and count
        values.push(`${metricName}_sum${labels} ${metric.sum}`);
        values.push(`${metricName}_count${labels} ${metric.count}`);
        break;
    }

    return values;
  }

  function getHelpText(type) {
    switch (type) {
      case 'counter':
        return 'Counter metric';
      case 'gauge':
        return 'Gauge metric';
      case 'histogram':
        return 'Histogram metric';
      default:
        return 'Metric';
    }
  }

  return {
    report,
    increment,
    value: _value,
    getMetrics,
  };
}

module.exports = {
  PrometheusReporter,
};
