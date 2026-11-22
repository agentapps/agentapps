import { createApp } from '@agentapps/sdk';
import { apiGet } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.open-meteo',
  name: 'Open-Meteo',
  version: '1.0.1',
  description:
    'Look up places by name and get weather from the free Open-Meteo APIs (no key): current conditions, daily and hourly forecasts up to 16 days, and historical weather back to 1940. Free tier is for non-commercial use only; data are CC BY 4.0.',
  tagline: 'Weather forecasts and historical weather for any place, from Open-Meteo',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'information',
  keywords: ['open-meteo', 'weather', 'forecast', 'historical weather', 'geocoding', 'climate'],
  entrypoint: {
    type: 'module',
    path: 'src/app.ts',
    export: 'factory',
  },
  runtime: {
    transport: 'stdio',
    command: 'tsx',
    args: ['src/app.ts'],
  },
  capabilities: {
    tools: true,
    health: true,
  },
});

app.health(async () => {
  try {
    // One small forecast request (a single current value), with a short timeout.
    // The health context has no abort signal; the short timeout bounds the request.
    await apiGet(
      '/v1/forecast',
      {},
      {
        host: 'forecast',
        params: { latitude: 0, longitude: 0, current: 'temperature_2m' },
        timeoutMs: 5_000,
      },
    );
    return { status: 'ready' as const, message: 'Open-Meteo reachable' };
  } catch (err) {
    return {
      status: 'degraded' as const,
      message: (err as Error).message,
      issues: [
        {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: (err as Error).message,
          severity: 'warning' as const,
        },
      ],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
