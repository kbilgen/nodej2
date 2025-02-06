const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const Bonjour = require('bonjour');
const cors = require('cors');
const fs = require('fs');

class BackupServer {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        this.server = null;
        this.bonjour = Bonjour();
        this.bonjourService = null;
    }

    setupMiddleware() {
        // Request logging middleware
        this.app.use((req, res, next) => {
            console.log(`📥 ${req.method} ${req.url}`);
            console.log('Headers:', req.headers);
            next();
        });

        // CORS ayarları
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: '*',
            credentials: true,
            preflightContinue: true
        }));

        // Güvenlik başlıkları
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', '*');
            res.header('Access-Control-Allow-Credentials', true);
            next();
        });

        // Body parser ayarları
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        
        // Yedekleme dizinini oluştur
        const uploadDir = path.join(os.homedir(), 'iPhone_Photo_Backup');
        try {
            // Ana dizini oluştur
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            console.log('📁 Upload directory:', uploadDir);
        } catch (error) {
            console.error('❌ Failed to create upload directory:', error);
            process.exit(1);
        }

        // Multer yapılandırması
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                // Tarih bazlı alt klasör oluştur
                const today = new Date();
                const subDir = path.join(
                    uploadDir,
                    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                );
                
                // Alt klasörü oluştur
                fs.mkdirSync(subDir, { recursive: true });
                console.log('📁 Saving to:', subDir);
                cb(null, subDir);
            },
            filename: (req, file, cb) => {
                // Dosya adını oluştur
                const fileName = req.get('X-File-Name') || file.originalname;
                const timestamp = Date.now();
                const ext = path.extname(fileName) || '.jpg';
                const newFileName = `${timestamp}-${path.basename(fileName, ext)}${ext}`;
                console.log('📄 File name:', newFileName);
                cb(null, newFileName);
            }
        });

        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: 50 * 1024 * 1024 // 50MB limit
            },
            fileFilter: (req, file, cb) => {
                // Sadece resim dosyalarını kabul et
                if (!file.mimetype.startsWith('image/')) {
                    return cb(new Error('Only image files are allowed'));
                }
                cb(null, true);
            }
        });
    }

    setupRoutes() {
        // CORS pre-flight için OPTIONS handler
        this.app.options('*', cors());

        // Status endpoint
        this.app.get('/status', (req, res) => {
            res.json({
                status: 'running',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // Test endpoint
        this.app.get('/', (req, res) => {
            res.send(`
                <html>
                    <body>
                        <h1>Photo Backup Server</h1>
                        <p>Server is running</p>
                        <p>Uptime: ${process.uptime()} seconds</p>
                        <p>Timestamp: ${new Date().toISOString()}</p>
                    </body>
                </html>
            `);
        });

        // Upload endpoint
        this.app.post('/upload', (req, res) => {
            console.log('📥 Upload request received');
            console.log('Headers:', req.headers);
            
            this.upload.single('photo')(req, res, (err) => {
                if (err) {
                    console.error('❌ Upload error:', err);
                    return res.status(400).json({
                        error: 'Upload failed',
                        details: err.message
                    });
                }

                if (!req.file) {
                    console.error('❌ No file in request');
                    return res.status(400).json({
                        error: 'No file received'
                    });
                }

                console.log('✅ File saved:', {
                    path: req.file.path,
                    size: req.file.size,
                    mimetype: req.file.mimetype
                });

                res.status(200).json({
                    success: true,
                    file: req.file.filename,
                    path: path.relative(os.homedir(), req.file.path)
                });
            });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            console.error('Error:', err);
            res.status(500).json({
                error: 'Server error',
                details: err.message
            });
        });
    }

    async start(preferredPort = 3000) {
        // Önce mevcut sunucuyu durdur
        if (this.server) {
            await new Promise(resolve => this.server.close(resolve));
        }

        console.log('\n=== Starting Server ===');
        
        const tryPort = async (port) => {
            try {
                const server = await new Promise((resolve, reject) => {
                    const srv = this.app.listen(port, '0.0.0.0')
                        .once('error', err => {
                            if (err.code === 'EADDRINUSE') {
                                console.log(`⚠️ Port ${port} is in use, trying ${port + 1}...`);
                                resolve(tryPort(port + 1));
                            } else {
                                reject(err);
                            }
                        })
                        .once('listening', () => {
                            console.log(`✅ Server is running on port ${port}`);
                            resolve(srv);
                        });
                });
                return server;
            } catch (error) {
                console.error('❌ Failed to start server:', error);
                throw error;
            }
        };

        try {
            this.server = await tryPort(preferredPort);
            const port = this.server.address().port;
            
            // IP adreslerini göster
            const networkInterfaces = require('os').networkInterfaces();
            console.log('\n📡 Available addresses:');
            Object.keys(networkInterfaces).forEach((ifname) => {
                networkInterfaces[ifname].forEach((iface) => {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        const address = `http://${iface.address}:${port}`;
                        console.log(`\n${ifname}:`);
                        console.log(`  Base URL: ${address}`);
                        console.log(`  Status: ${address}/status`);
                        console.log(`  Upload: ${address}/upload`);
                    }
                });
            });
            
            // Bonjour servisi başlat
            await this.setupBonjour(port);
            
            return port;
        } catch (error) {
            console.error('❌ Server start failed:', error);
            process.exit(1);
        }
    }

    setupBonjour(port) {
        try {
            const serviceConfig = {
                name: 'iPhone Photo Backup',
                type: '_photobackup._tcp',
                port: port,
                host: require('os').hostname()
            };
            
            this.bonjourService = this.bonjour.publish(serviceConfig);
            console.log('📡 Bonjour service published');
        } catch (error) {
            console.error('❌ Bonjour service error:', error);
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
            
            if (this.bonjourService) {
                this.bonjourService.stop();
            }
            
            if (this.bonjour) {
                this.bonjour.destroy();
            }
            
            console.log('Sunucu ve Bonjour servisi durduruldu');
        }
    }
}

module.exports = BackupServer; 