import type { AgentApp } from '@agentapps/sdk';
import { registerGetForecastTool } from './get-forecast.js';
import { registerGetHistoricalWeatherTool } from './get-historical-weather.js';
import { registerSearchLocationsTool } from './search-locations.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  registerSearchLocationsTool(app);
  registerGetForecastTool(app);
  registerGetHistoricalWeatherTool(app);
}
