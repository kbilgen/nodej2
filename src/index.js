const BackupServer = require('./server');

const server = new BackupServer();
server.start(3000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.stop();
    process.exit(0);
}); 