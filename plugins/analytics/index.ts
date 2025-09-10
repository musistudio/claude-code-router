import type { FastifyInstance } from 'fastify';
import { analyticsRoutes } from './routes/analytics';
import { missionControlRoutes } from './routes/mission-control';
import { analytics } from './manager';
import { trackingStartMiddleware, trackingEndMiddleware } from './middleware/tracking';

export default class AnalyticsPlugin {
  private analytics: any;
  
  install(server: FastifyInstance, config: any) {
    console.log('🔌 Installing Analytics Plugin...');
    
    // Initialize analytics manager
    this.analytics = analytics;
    this.analytics.updateConfig(config);
    
    // Register Analytics routes (they already have /api/analytics prefix in routes)
    server.register(analyticsRoutes);
    console.log('✅ Analytics routes registered');
    
    // Register Mission Control routes (keeps existing /api/v1/mission-control prefix)
    server.register(missionControlRoutes);
    console.log('✅ Mission Control routes registered');
    
    // Add REAL tracking middleware (like in advanced-theme-redesign)
    server.addHook('preHandler', (request: any, reply: any, done: any) => {
      trackingStartMiddleware(request, reply, done);
    });
    server.addHook('onSend', (request: any, reply: any, payload: any, done: any) => {
      // Pass config to tracking middleware
      (request as any)._pluginConfig = config;
      trackingEndMiddleware(request, reply, payload, done);
    });
    console.log('✅ Analytics tracking middleware registered');
    
    console.log('✅ Analytics Plugin installed successfully');
  }
}