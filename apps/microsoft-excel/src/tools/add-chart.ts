import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, worksheetRef } from '../lib/index.js';

/** add-chart — POST {worksheet}/charts/add. */
export function registerAddChartTool(app: AgentApp): void {
  app.tool('add-chart', {
    description:
      'Add a chart to a worksheet from a range of data. Use get-chart-image afterwards to see the result.',
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'Workbook drive item ID. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description:
            'Workbook path relative to the drive root. Pass literal names, not pre-encoded ones.',
        },
        worksheet: { type: 'string', description: 'Worksheet name or id the chart is added to' },
        chartType: {
          type: 'string',
          description:
            'Excel chart type, e.g. "ColumnClustered", "Line", "Pie", "BarClustered", "XYScatter", "Area".',
        },
        sourceData: {
          type: 'string',
          description: 'Range supplying the chart data, in A1 notation, e.g. "A1:B10".',
        },
        seriesBy: {
          type: 'string',
          description: 'Whether each series comes from "Columns" (default), "Rows", or "Auto".',
        },
      },
      required: ['worksheet', 'chartType', 'sourceData'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const chart = await graphRequest<Record<string, any>>(
        'POST',
        `${worksheetRef(a)}/charts/add`,
        {
          type: a.chartType as string,
          sourceData: a.sourceData as string,
          seriesBy: (a.seriesBy as string) || 'Columns',
        },
      );

      return {
        success: true,
        account: email,
        chart: {
          id: chart.id,
          name: chart.name,
          height: chart.height,
          width: chart.width,
        },
      };
    },
  });
}
