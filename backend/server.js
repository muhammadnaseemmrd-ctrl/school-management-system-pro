require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/database');
const { seedSuperAdmin } = require('./utils/seedSuperAdmin');

// Import routes
const authRoutes = require('./routes/authRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const classRoutes = require('./routes/classRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const dailyAttendanceRoutes = require('./routes/dailyAttendanceRoutes');
const marksRoutes = require('./routes/marksRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const homeworkRoutes = require('./routes/homeworkRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const eventRoutes = require('./routes/eventRoutes');
const messageRoutes = require('./routes/messageRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const fileProxyRoutes = require('./routes/fileProxyRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const parentRoutes = require('./routes/parentRoutes');
const guardianRoutes = require('./routes/guardianRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const profileRoutes = require('./routes/profileRoutes');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const { featureGate } = require('./utils/plans');
const gate = (key) => [authenticate, featureGate(key)];

// Initialize Express and Socket.io
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
].filter(Boolean);

const app = express();
app.set('trust proxy', 1); // behind Render/Railway/Nginx – needed for correct client IPs
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'connect-src': ["'self'", 'https:', 'wss:', 'ws:'],
        'frame-src': ["'self'", 'https:', 'blob:'],
        'object-src': ["'self'", 'https:', 'blob:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback to accept other local variants if needed
    }
  },
  credentials: true,
}));
// Photographs of answer sheets arrive as JSON (a JPEG of up to 900 KB, base64); everything else keeps the small default limit.
app.use('/api/omr', express.json({ limit: '2mb' }));
// Nursery photos (a JPEG up to 600 KB) and recordings (up to 1 MB) also arrive as base64 JSON.
app.use('/api/early', express.json({ limit: '2mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection (+ bootstrap the platform owner account from env vars)
const ready = connectDB()
  .then(() => require('./utils/plans').ensurePlans())
  .then(() => seedSuperAdmin())
  .then(() => (process.env.SEED_DEMO === 'true' ? require('./scripts/seedDemo')() : null))
  .catch((e) => console.error('Startup error:', e.message));

// On serverless hosts (Vercel) wait for DB + bootstrap before handling the first request
if (process.env.VERCEL) {
  app.use((req, res, next) => ready.then(() => next(), next));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/timetables', gate('timetable'), timetableRoutes);
app.use('/api/attendance', gate('attendance'), attendanceRoutes);
app.use('/api/daily-attendance', gate('attendance'), dailyAttendanceRoutes);
app.use('/api/marks', gate('marks'), marksRoutes);
app.use('/api/notices', gate('notices'), noticeRoutes);
app.use('/api/homework', gate('homework'), homeworkRoutes);
app.use('/api/complaints', gate('complaints'), complaintRoutes);
app.use('/api/events', gate('events'), eventRoutes);
app.use('/api/messages', gate('messages'), messageRoutes);
app.use('/api/comms', express.json({ limit: '200kb' }), gate('messages'), require('./routes/commsRoutes'));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/fees', require('./routes/feeRoutes'));
app.use('/api/files', fileProxyRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/agent', require('./routes/agentRoutes'));
app.use('/api/parents', gate('parentPortal'), parentRoutes);
app.use('/api/guardians', guardianRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/admissions', require('./routes/admissionRoutes'));
app.use('/api/finance', require('./routes/financeRoutes'));
app.use('/api/hr', require('./routes/hrRoutes'));
app.use('/api/attendance-ops', require('./routes/attendanceOpsRoutes'));
app.use('/api/safety', require('./routes/safetyRoutes'));
app.use('/api/timetable-ops', gate('timetable'), require('./routes/timetableOpsRoutes'));
app.use('/api/studio', require('./routes/studioRoutes'));
app.use('/api/assess', require('./routes/assessRoutes'));
app.use('/api/omr', require('./routes/omrRoutes'));
app.use('/api/early', require('./routes/earlyRoutes'));
app.use('/api/care', express.json({ limit: '200kb' }), require('./routes/careRoutes'));
app.use('/api/theme', express.json({ limit: '100kb' }), require('./routes/themeRoutes'));
app.use('/api/migration', express.json({ limit: '3mb' }), require('./routes/migrationRoutes'));
app.use('/api/training', express.json({ limit: '300kb' }), require('./routes/trainingRoutes'));
app.use('/api/library', express.json({ limit: '1mb' }), require('./routes/libraryRoutes'));
app.use('/api/procure', express.json({ limit: '1mb' }), require('./routes/procureRoutes'));
app.use('/api/transport', express.json({ limit: '1mb' }), require('./routes/transportRoutes'));
app.use('/api/accounts', express.json({ limit: '1mb' }), require('./routes/accountsRoutes'));
app.use('/api/store', express.json({ limit: '200kb' }), require('./routes/storeRoutes'));
app.use('/api/registrar', express.json({ limit: '200kb' }), require('./routes/registrarRoutes'));
app.use('/api/campuses', express.json({ limit: '50kb' }), require('./routes/campusRoutes'));
app.use('/api/consents', express.json({ limit: '50kb' }), require('./routes/consentRoutes'));
app.use('/api/organizations', express.json({ limit: '50kb' }), require('./routes/organizationRoutes'));
app.use('/api/support', express.json({ limit: '100kb' }), require('./routes/supportRoutes'));
app.use('/api/sync', require('./routes/syncRoutes'));
app.use('/api/teacher-today', require('./routes/teacherTodayRoutes'));
app.use('/api/notifications', notificationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/backup', require('./routes/backupRoutes'));
app.use('/api/cron', require('./routes/cronRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Serve the built React app (single-service deployment).
// Enabled automatically when frontend/dist exists (e.g. after `npm run build`).
const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Socket.io Connection
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Store user socket mapping
  socket.on('user-connected', (userId) => {
    userSockets.set(userId, socket.id);
    io.emit('user-online', { userId });
  });

  // Real-time notifications
  socket.on('notify-all', (data) => {
    io.emit('notification', data);
  });

  socket.on('notify-user', (data) => {
    const userSocket = userSockets.get(data.userId);
    if (userSocket) {
      io.to(userSocket).emit('notification', data);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (let [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        io.emit('user-offline', { userId });
        break;
      }
    }
  });
});

// Error Handling
app.use(notFound);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Weekly automatic school backups (Sunday 02:00 Pakistan time). On Vercel this is done by the cron job instead.
  require('node-cron').schedule('0 2 * * 0', () => {
    ready.then(() => require('./utils/backup').runWeekly({ budgetMs: 10 * 60 * 1000 })).catch((e) => console.error('[backup] weekly job failed:', e.message));
  }, { timezone: 'Asia/Karachi' });

  // Family communication (PRD E20): release pushes held for quiet hours, raise late replies, remind families of meetings. On Vercel the daily cron does this.
  require('node-cron').schedule('*/10 * * * *', () => {
    ready.then(async () => { const School = require('./models/School'); const sweep = require('./utils/comms/sweep'); for (const sc of await School.find({ isActive: { $ne: false } }).select('_id').limit(500)) await sweep.run(sc._id); }).catch((e) => console.error('[comms] sweep failed:', e.message));
  });

  // Student care (PRD E21): escalate unseen concerns, case reviews, medicine not recorded, overdue privacy requests. On Vercel the daily cron does this.
  require('node-cron').schedule('*/15 * * * *', () => {
    ready.then(async () => { const School = require('./models/School'); const sweep = require('./utils/care/sweep'); for (const sc of await School.find({ isActive: { $ne: false } }).select('_id').limit(500)) await sweep.run(sc._id); }).catch((e) => console.error('[care] sweep failed:', e.message));
  });

  // School web addresses (PRD E27): look again at live addresses once a day. On Vercel the daily cron does this.
  require('node-cron').schedule('20 3 * * *', () => {
    ready.then(async () => { const School = require('./models/School'); const K = require('./controllers/themeController'); for (const sc of await School.find({ isActive: { $ne: false } }).select('_id').limit(500)) await K.sweep(sc._id); }).catch((e) => console.error('[theme] sweep failed:', e.message));
  });

  // Sales and support (PRD E28): quotes expire, invoices get reminders, support deadlines are flagged. On Vercel the daily cron does this.
  require('node-cron').schedule('*/30 * * * *', () => {
    ready.then(async () => { await require('./controllers/salesController').sweep(); await require('./controllers/supportController').sweep(); }).catch((e) => console.error('[sales] sweep failed:', e.message));
  });

  // Auto Notice Expiration Cleanup Task
  const Notice = require('./models/Notice');
  const { deleteCloudinaryFile } = require('./utils/cloudinaryHelper');

  const cleanupExpiredNotices = async () => {
    try {
      const expiredNotices = await Notice.find({ expiresAt: { $lte: new Date() } });
      if (expiredNotices.length > 0) {
        console.log(`Found ${expiredNotices.length} expired notices. Cleaning up...`);
        for (const notice of expiredNotices) {
          if (notice.attachments && notice.attachments.length > 0) {
            for (const url of notice.attachments) {
              if (url) await deleteCloudinaryFile(url);
            }
          }
          await Notice.findByIdAndDelete(notice._id);
          console.log(`Automatically deleted expired notice: ${notice.title}`);
        }
      }
    } catch (err) {
      console.error('Error in expired notice cleanup scheduler:', err);
    }
  };

  // Run immediately on boot, and then every hour
  cleanupExpiredNotices();
  setInterval(cleanupExpiredNotices, 60 * 60 * 1000);
});

// Handle Unhandled Rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  if (!process.env.VERCEL) process.exit(1);
});

module.exports = app;
// Reload trigger

