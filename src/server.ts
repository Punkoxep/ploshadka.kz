import app from './app';
import { ENV } from './config/env';
import { CronService } from './services/cronService';

const PORT = ENV.PORT || 3000;

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Sports Ground Sharing Backend is running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`📊 Interactive Web Test Dashboard: http://localhost:${PORT}`);
  console.log(`=======================================================`);

  // Initialize TTLock Gateway Health Cron Monitoring & Automated No-Show Worker
  CronService.initGatewayMonitoring();
  CronService.initNoShowAutoCheck();
});
