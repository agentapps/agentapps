import type { AgentApp } from '@agentapps/sdk';

interface ModelInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  parameters: string[];
}

/**
 * higgsfield-list-models — list available models and their capabilities.
 *
 * Returns a curated list of known models from Higgsfield. No API call needed.
 */
export function registerListModelsTool(app: AgentApp): void {
  app.tool('higgsfield-list-models', {
    description:
      'List available models and their capabilities. Params: type? ("all"|"text-to-image"|"image-to-video"|"text-to-video"|"image-to-image", default "all").',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['all', 'text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
          default: 'all',
          description: 'Filter models by type',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args) => {
      const allModels: ModelInfo[] = [
        // TEXT-TO-IMAGE
        {
          id: 'nano-banana-pro',
          name: 'Nano Banana Pro',
          type: 'text-to-image',
          description:
            'Fast, high-quality text-to-image generation. Supports 1k, 2k, 4k resolution.',
          parameters: ['prompt', 'resolution', 'aspect_ratio'],
        },
        {
          id: 'higgsfield-ai/soul/standard',
          name: 'Soul Standard',
          type: 'text-to-image',
          description:
            'Flagship text-to-image model with ultra-realistic fashion and portrait generation.',
          parameters: ['prompt', 'aspect_ratio', 'resolution'],
        },
        {
          id: 'bytedance/seedream/v4/text-to-image',
          name: 'Seedream v4',
          type: 'text-to-image',
          description: 'High-quality text-to-image generation by ByteDance.',
          parameters: ['prompt', 'resolution', 'aspect_ratio'],
        },
        {
          id: 'reve/text-to-image',
          name: 'Reve',
          type: 'text-to-image',
          description: 'Versatile text-to-image generation with creative styles.',
          parameters: ['prompt', 'resolution', 'aspect_ratio'],
        },
        {
          id: 'flux-pro',
          name: 'FLUX Pro',
          type: 'text-to-image',
          description: 'State-of-the-art photorealistic image generation.',
          parameters: ['prompt', 'aspect_ratio'],
        },
        {
          id: 'flux-dev',
          name: 'FLUX Dev',
          type: 'text-to-image',
          description: 'Fast development version of FLUX.',
          parameters: ['prompt', 'aspect_ratio'],
        },
        // IMAGE EDITING
        {
          id: 'bytedance/seedream/v4/edit',
          name: 'Seedream v4 Edit',
          type: 'image-to-image',
          description: 'Advanced image editing capabilities.',
          parameters: ['prompt', 'image', 'resolution'],
        },
        {
          id: 'higgsfield-ai/soul/image-to-image',
          name: 'Soul Image-to-Image',
          type: 'image-to-image',
          description: 'Character-consistent image generation from reference images.',
          parameters: ['prompt', 'image', 'resolution'],
        },
        {
          id: 'nano-banana-pro-inpaint',
          name: 'Nano Banana Pro Inpaint',
          type: 'image-to-image',
          description: 'Inpainting and image editing with Nano Banana.',
          parameters: ['prompt', 'image', 'mask'],
        },
        // IMAGE-TO-VIDEO
        {
          id: 'higgsfield-ai/dop/standard',
          name: 'DoP Standard',
          type: 'image-to-video',
          description: 'Standard image-to-video animation with motion control.',
          parameters: ['image_url', 'prompt', 'duration'],
        },
        {
          id: 'higgsfield-ai/dop/preview',
          name: 'DoP Preview',
          type: 'image-to-video',
          description: 'Fast preview version of DoP for quick iterations.',
          parameters: ['image_url', 'prompt', 'duration'],
        },
        {
          id: 'bytedance/seedance/v1/pro/image-to-video',
          name: 'Seedance v1 Pro',
          type: 'image-to-video',
          description: 'Professional-grade video generation from images.',
          parameters: ['image_url', 'prompt', 'duration'],
        },
        {
          id: 'kling-video/v2.1/pro/image-to-video',
          name: 'Kling v2.1 Pro I2V',
          type: 'image-to-video',
          description: 'Advanced cinematic animations from images.',
          parameters: ['image_url', 'prompt', 'duration'],
        },
        {
          id: 'minimax/image-to-video',
          name: 'Minimax I2V',
          type: 'image-to-video',
          description: 'High-quality image-to-video generation.',
          parameters: ['image_url', 'prompt'],
        },
        // TEXT-TO-VIDEO
        {
          id: 'kling/v2.6/text-to-video',
          name: 'Kling v2.6',
          type: 'text-to-video',
          description: 'Generate videos from text prompts with audio support.',
          parameters: ['prompt', 'duration', 'resolution', 'aspect_ratio'],
        },
        {
          id: 'kling/v3.0/text-to-video',
          name: 'Kling v3.0',
          type: 'text-to-video',
          description: 'Latest Kling model with improved quality and motion.',
          parameters: ['prompt', 'duration', 'resolution', 'aspect_ratio'],
        },
        {
          id: 'minimax/video-01',
          name: 'Minimax Video',
          type: 'text-to-video',
          description: 'High-quality video generation from text.',
          parameters: ['prompt', 'duration'],
        },
        {
          id: 'wan/v2.6/text-to-video',
          name: 'WAN v2.6',
          type: 'text-to-video',
          description: 'Text-to-video with camera control.',
          parameters: ['prompt', 'duration', 'camera_motion'],
        },
        {
          id: 'veo/v3.1/text-to-video',
          name: 'Google Veo 3.1',
          type: 'text-to-video',
          description: "Google's Veo model for high-quality video generation.",
          parameters: ['prompt', 'duration', 'aspect_ratio'],
        },
        {
          id: 'sora/v2/text-to-video',
          name: 'Sora 2',
          type: 'text-to-video',
          description: "OpenAI's Sora model for cinematic video generation.",
          parameters: ['prompt', 'duration', 'aspect_ratio'],
        },
      ];

      const filterType = (args.type as string) || 'all';

      const filteredModels =
        filterType === 'all' ? allModels : allModels.filter((m) => m.type === filterType);

      return {
        total: filteredModels.length,
        filter: filterType,
        models: filteredModels,
        note: 'This is a curated list. Visit https://cloud.higgsfield.ai/explore for the complete gallery of 100+ models.',
      };
    },
  });
}
