import express from 'express';
import cors from 'cors';
import path from 'path';
import router from './routes';
import { Logger } from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files (Interactive Web Test Simulator)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/v1', router);

// Global Error Handler for unified error responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  Logger.error('Unhandled Server Error', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Внутренняя ошибка сервера',
  });
});

export default app;
