function PrometheusReporter(options = {}) {
  const {
    prefix = '',
    softLimit = 5000,
    hardLimit = 10000,
    warnAt = 4000,
    buckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    logCallback,
  } = options;

  const metrics = new Map();
  let warned = false;

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
    const metricsByName = metrics.entries().reduce((groups, [key, metric]) => {
      const { name } = parseKey(key);
      const metricName = prefix + name;

      return {
        ...groups,
        [metricName]: [...(groups[metricName] || []), { key, metric }],
      };
    }, {});

    const output = Object.entries(metricsByName).flatMap(([metricName, metricEntries]) => {
      const firstMetric = metricEntries[0].metric;

      const headerLines = [
        `# HELP ${metricName} ${getHelpText(firstMetric.type)}`,
        `# TYPE ${metricName} ${firstMetric.type}`,
      ];

      const valueLines = metricEntries.flatMap(({ key, metric }) => {
        const { labels } = parseKey(key);
        return formatMetricValues(metricName, metric, labels);
      });

      return [...headerLines, ...valueLines];
    });

    const result = output.join('\n') + (output.length > 0 ? '\n' : '');
    if (metrics.size > softLimit) {
      log('info', 'SOFT_LIMIT_EXCEEDED', 'Soft limit exceeded, resetting metrics after scrape', {
        softLimit,
        size: metrics.size,
      });
      metrics.clear();
      warned = false;
    }

    return result;
  }

  function log(level, code, message, params = {}) {
    if (logCallback && typeof logCallback === 'function') {
      logCallback({
        level,
        code,
        message,
        params,
        timestamp: Date.now(),
        reporter: 'PrometheusReporter',
      });
    }
  }

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
      log('error', 'HARD_LIMIT_REACHED', 'Hard limit reached, forcing metrics reset', {
        hardLimit,
        size: metrics.size,
        attemptedKey: metricKey,
      });
      metrics.clear();
      warned = false;
    }

    // Warning threshold
    if (!warned && metrics.size >= warnAt) {
      log('warn', 'APPROACHING_SOFT_LIMIT', 'Approaching soft limit', {
        softLimit,
        warnAt,
        size: metrics.size,
      });
      warned = true;
    }

    const existing = metrics.get(metricKey) || createMetric(type);
    const updated = updateMetricValue(existing, value, type);
    metrics.set(metricKey, updated);
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
    if (type === 'counter') {
      return {
        ...metric,
        value: metric.value + value,
      };
    }

    if (type === 'gauge') {
      return {
        ...metric,
        value,
      };
    }

    if (type === 'histogram') {
      const newBuckets = new Map(metric.buckets);
      buckets.forEach(bucket => {
        if (value <= bucket) {
          newBuckets.set(bucket, newBuckets.get(bucket) + 1);
        }
      });

      return {
        ...metric,
        sum: metric.sum + value,
        count: metric.count + 1,
        buckets: newBuckets,
      };
    }

    return {
      ...metric,
      value,
    };
  }

  function parseKey(metricKey) {
    const match = metricKey.match(/^([^{]+)(\{.*})?$/);
    if (!match) {
      return { name: metricKey, labels: '' };
    }
    return {
      name: match[1],
      labels: match[2] || '',
    };
  }

  function formatMetricValues(metricName, metric, labels) {
    if (metric.type === 'counter') {
      return [`${metricName}_total${labels} ${metric.value}`];
    }

    if (metric.type === 'gauge') {
      return [`${metricName}${labels} ${metric.value}`];
    }

    if (metric.type === 'histogram') {
      const bucketValues = metric.buckets.entries().map(([bucket, count]) => {
        const bucketLabel = labels ? labels.replace('}', `,le="${bucket}"}`) : `{le="${bucket}"}`;
        return `${metricName}_bucket${bucketLabel} ${count}`;
      });

      const infLabel = labels ? labels.replace('}', ',le="+Inf"}') : '{le="+Inf"}';
      return [
        ...bucketValues,
        `${metricName}_bucket${infLabel} ${metric.count}`,
        `${metricName}_sum${labels} ${metric.sum}`,
        `${metricName}_count${labels} ${metric.count}`,
      ];
    }

    return [];
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
