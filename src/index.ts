import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { setupSwagger } from './config/swagger';

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Rate Limiter for Auth
const rateLimiter = new RateLimiterMemory({
  points: 5, // 5 requests
  duration: 60, // per 60 seconds by IP
});

app.use('/api/auth', async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip!);
    next();
  } catch (error) {
    res.status(429).json({ message: 'Too many requests, please try again later.' });
  }
});

// Swagger Documentation
setupSwagger(app);

// Routes
import internshipRoutes from './routes/internship.routes';
import programsRoutes from './routes/programs.routes';
import eventsRoutes from './routes/events.routes';
import profileRoutes from './routes/profile.routes';
import submitRoutes from './routes/submit.report.routes';
import cohortsRoutes from './routes/cohorts.routes';
import tasksRoutes from './routes/tasks.routes';
import gamificationRoutes from './routes/gamification.routes';
import githubRoutes from './routes/github.routes';
import scoresRoutes from './routes/scores.routes';
import documentsRoutes from './routes/documents.routes';

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/internship', internshipRoutes);
app.use('/api/programs', programsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api', submitRoutes);

// New routes for enhanced functionality
app.use('/api/cohorts', cohortsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/scores', scoresRoutes);
app.use('/api/documents', documentsRoutes);
// Error Handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

const PORT = env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Zigex Agent API running on http://localhost:${PORT} [${env.NODE_ENV}]`);
});
