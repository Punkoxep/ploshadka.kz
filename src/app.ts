import express from 'express';
import cors from 'cors';
import path from 'path';
import router from './routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (Interactive Web Test Simulator)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/v1', router);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[GlobalErrorHandler]', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Внутренняя ошибка сервера',
  });
});

export default app;
