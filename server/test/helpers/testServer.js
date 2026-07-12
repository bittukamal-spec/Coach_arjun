const app = require('../../src/index.js');

// Starts the imported Express app on an OS-assigned ephemeral port — never
// the production PORT — so tests never collide with a real running server.
function startTestServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stopTestServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { startTestServer, stopTestServer };
