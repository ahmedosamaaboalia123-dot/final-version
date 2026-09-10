// Local startup against an existing database: no migrations or seed writes.
const http = require('http');
const app = require('./app');
const { port } = require('./config/env');
const { initSocket } = require('./websocket/socket.server');
const logger = require('./lib/logger');
const server = http.createServer(app);
initSocket(server);
server.listen(port, '127.0.0.1', () => {
  logger.info(`404 Coffee API running on http://localhost:${port}`);
});
