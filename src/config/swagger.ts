import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Zila API - Zigex Agent',
      version: '1.0.0',
      description: 'API documentation for the Zigex Terminal Agent.',
      contact: {
        name: 'Zigex Team',
        url: 'https://zigexconnect.com',
      },
    },
    servers: [
      ...(env.RENDER_EXTERNAL_URL ? [{
        url: env.RENDER_EXTERNAL_URL,
        description: 'Production server',
      }] : []),
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/index.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  // Swagger Page
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "Zila API Docs"
  }));

  // Docs in JSON format
  app.get('/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log(`📝 Swagger docs available at http://localhost:${env.PORT}/docs`);
};
