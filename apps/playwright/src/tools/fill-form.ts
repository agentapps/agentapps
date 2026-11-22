import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef } from '../browser.js';

export function registerFillFormTool(app: AgentApp): void {
  app.tool('fill-form', {
    description: 'Fill multiple form fields',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Human-readable field name' },
              type: {
                type: 'string',
                enum: ['textbox', 'checkbox', 'radio', 'combobox', 'slider'],
                description: 'Type of the field',
              },
              ref: {
                type: 'string',
                description: 'Exact target field reference from the page snapshot',
              },
              value: {
                type: 'string',
                description:
                  'Value to fill in the field. If the field is a checkbox, the value should be `true` or `false`. If the field is a combobox, the value should be the text of the option.',
              },
            },
            required: ['name', 'type', 'ref', 'value'],
            additionalProperties: false,
          },
          description: 'Fields to fill in',
        },
      },
      required: ['fields'],
    },
    // Acts on a live web page. A `radio` field is a plain click on whatever `ref` points at,
    // so it can press a submit button: annotated for the worst case, like click.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      const fields = args.fields as Array<{
        name: string;
        type: string;
        ref: string;
        value: string;
      }>;
      const results: string[] = [];

      for (const field of fields) {
        const el = await findElementByRef(page, field.ref);
        if (!el) {
          results.push(`[FAIL] ${field.name}: Element not found`);
          continue;
        }

        try {
          switch (field.type) {
            case 'textbox':
              await el.fill(field.value);
              results.push(`[OK] ${field.name}: filled with "${field.value}"`);
              break;

            case 'checkbox': {
              const shouldCheck = field.value === 'true';
              const isChecked = await el.isChecked();
              if (shouldCheck !== isChecked) {
                await el.click();
              }
              results.push(`[OK] ${field.name}: ${shouldCheck ? 'checked' : 'unchecked'}`);
              break;
            }

            case 'radio':
              await el.click();
              results.push(`[OK] ${field.name}: selected`);
              break;

            case 'combobox':
              await el.selectOption({ label: field.value });
              results.push(`[OK] ${field.name}: selected "${field.value}"`);
              break;

            case 'slider':
              // For sliders, we need to set the value via JavaScript
              await el.evaluate((node, val) => {
                (node as HTMLInputElement).value = val;
                node.dispatchEvent(new Event('input', { bubbles: true }));
                node.dispatchEvent(new Event('change', { bubbles: true }));
              }, field.value);
              results.push(`[OK] ${field.name}: set to ${field.value}`);
              break;

            default:
              results.push(`[FAIL] ${field.name}: Unknown field type "${field.type}"`);
          }
        } catch (error) {
          results.push(
            `[FAIL] ${field.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      return results.join('\n');
    },
  });
}
