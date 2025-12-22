/**
 * Prometheus Reporter Example
 *
 * This example demonstrates how to use the PrometheusReporter with an Express application.
 * To run this example:
 * 1. npm install express (if not already installed)
 * 2. node examples/prometheus.js
 * 3. Visit http://localhost:3000/metrics to see Prometheus metrics
 * 4. Make requests to http://localhost:3000/, /users, /error to generate metrics
 */
const http = require('http'); // Server for scraping the metrics
const { Metrics, PrometheusReporter } = require('..');

// Note: limits are lowered for the sake of example.
// Recommendation is to start with the default and configure as the application grows
const prometheusReporter = new PrometheusReporter({
  prefix: 'example_app_',
  softLimit: 100,
  hardLimit: 200,
  warnAt: 80,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000], // Response time buckets in ms
});

const metrics = new Metrics({
  reporters: [prometheusReporter],
  tags: { service: 'example_service' },
});

// Simulate API endpoints and their processing times
const endpoints = [
  { path: '/', avgTime: 20, variation: 10 },
  { path: '/users', avgTime: 150, variation: 50 },
  { path: '/products', avgTime: 300, variation: 100 },
  { path: '/search', avgTime: 500, variation: 200 },
];

// Simulate different status codes
const statusCodes = [
  { code: 200, weight: 70 },
  { code: 201, weight: 10 },
  { code: 400, weight: 5 },
  { code: 404, weight: 10 },
  { code: 500, weight: 5 },
];

// Function to get random status code based on weights
function getRandomStatus() {
  const random = Math.random() * 100;
  let sum = 0;
  for (const status of statusCodes) {
    sum += status.weight;
    if (random < sum) {
      return status.code;
    }
  }
  return 200;
}

// Function to simulate processing time
function getProcessingTime(endpoint) {
  const { avgTime: base, variation } = endpoint.variation;
  return Math.max(1, base + (Math.random() - 0.5) * 2 * variation);
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const start = Date.now();

  // Handle /metrics endpoint
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(prometheusReporter.getMetrics());
    console.log('📊 Metrics scraped');
    return;
  }

  // Simulate endpoint processing
  const endpoint = endpoints.find(e => e.path === req.url) || endpoints[0];
  const processingTime = getProcessingTime(endpoint);
  const statusCode = getRandomStatus();

  setTimeout(() => {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(`Response from ${endpoint.path} with status ${statusCode}`);

    const duration = Date.now() - start;

    // Record metrics
    metrics.space('http_requests', {
      method: 'GET',
      path: endpoint.path,
      status: statusCode.toString(),
    }).increment();

    metrics.space('http_request_duration', {
      method: 'GET',
      path: endpoint.path,
    }).report(duration);

    // Track active connections (gauge)
    const activeConnections = Math.floor(Math.random() * 10) + 1;
    metrics.space('active_connections').value(activeConnections);

    // Track bytes sent (example of custom metric)
    const bytesSent = Math.floor(Math.random() * 10000) + 100;
    metrics.space('bytes_sent', {
      path: endpoint.path,
    }).increment(bytesSent);

    console.log(`✅ ${req.url} - ${statusCode} (${duration}ms)`);
  }, processingTime);
});

// Function to generate simulated traffic
function generateTraffic() {
  setInterval(() => {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    // Simulate internal request
    http.get(`http://localhost:3000${endpoint.path}`, (res) => {
      res.on('data', () => {}); // Consume response
    }).on('error', (err) => {
      console.error('Request error:', err.message);
    });
  }, 100); // Generate request every 100ms
}

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Example server running on http://localhost:${PORT}`);
  console.log(`📈 Prometheus metrics available at http://localhost:${PORT}/metrics`);
  console.log('\nGenerating simulated traffic...');
  console.log('Watch the console warnings as we approach cardinality limits!\n');

  // Start generating traffic
  generateTraffic();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n📊 Final metrics:');
  console.log(prometheusReporter.getMetrics());
  process.exit(0);
});

// Demo: Create high cardinality scenario after 5 seconds
setTimeout(() => {
  console.log('\n⚠️  Creating high cardinality scenario with user IDs...\n');

  // This will trigger warnings and eventual reset
  const interval = setInterval(() => {
    const userId = Math.floor(Math.random() * 1000);
    metrics.space('user_actions', {
      userId: userId.toString(),
      action: 'click',
    }).increment();
  }, 50);

  // Stop after 10 seconds
  setTimeout(() => {
    clearInterval(interval);
    console.log('\n✅ High cardinality scenario stopped\n');
  }, 10000);
}, 5000);
