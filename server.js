'use strict';

require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log('\n──────────────────────────────────────────');
      console.log(`🚀  myroomm.in API  →  http://localhost:${PORT}`);
      console.log(`🌍  Environment   →  ${process.env.NODE_ENV}`);
      console.log(`💳  Payment GW    →  ${process.env.PAYMENT_GATEWAY || 'razorpay'}`);
      console.log('──────────────────────────────────────────\n');
    });

    // Graceful shutdown on SIGTERM / SIGINT
    const shutdown = (signal) => {
      console.log(`\n${signal} received – shutting down gracefully…`);
      server.close(() => {
        console.log('✅  HTTP server closed.');
        process.exit(0);
      });
      // Force-exit if server hasn't closed within 10 s
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      console.error('❌  Unhandled Rejection:', reason);
      server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (err) => {
      console.error('❌  Uncaught Exception:', err.message);
      process.exit(1);
    });

  } catch (err) {
    console.error('❌  Server startup failed:', err.message);
    process.exit(1);
  }
};

startServer();
