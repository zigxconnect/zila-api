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
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);

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
