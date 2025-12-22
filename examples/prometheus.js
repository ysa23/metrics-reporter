/**
 * Simple Prometheus Reporter Example
 *
 * This example shows how to expose Prometheus metrics via HTTP for scraping.
 * To run this example:
 * 1. node examples/prometheus.js
 * 2. Visit http://localhost:3000/metrics to see Prometheus metrics
 */
const http = require('http');
const { Metrics, PrometheusReporter } = require('..');

// Create the Prometheus reporter
const prometheusReporter = new PrometheusReporter({
  prefix: 'myapp_',
});

// Initialize metrics
const metrics = new Metrics({
  reporters: [prometheusReporter],
});

// Generate some example metrics
function generateMetrics() {
  // Counter: HTTP requests
  metrics.space('http_requests', { method: 'GET', status: '200' }).increment();
  metrics.space('http_requests', { method: 'POST', status: '201' }).increment(2);
  // Gauge: Active connections
  metrics.space('active_connections').value(Math.floor(Math.random() * 50) + 10);
  // Histogram: Response time
  metrics.space('response_time').report(Math.random() * 100 + 50);
}

// Generate initial metrics
generateMetrics();

// Continue generating metrics every 5 seconds
setInterval(generateMetrics, 5000);

// Create HTTP server with metrics endpoint
const server = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(prometheusReporter.getMetrics());
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Try /metrics');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Metrics available at http://localhost:${PORT}/metrics`);
});
