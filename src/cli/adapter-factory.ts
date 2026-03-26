import type { CMSAdapter } from '../adapters/types.js';
import { CraftAdapter } from '../adapters/craft/index.js';
import { PayloadAdapter } from '../adapters/payload/index.js';
import { WordPressAdapter } from '../adapters/wordpress/index.js';
import type { AdapterConfig } from '../core/config-schema.js';

/**
 * Instantiate the correct CMSAdapter from a validated AdapterConfig.
 */
export function createAdapter(config: AdapterConfig): CMSAdapter {
  switch (config.adapter) {
    case 'craft':
      if (!config.apiKey) {
        throw new Error('Craft CMS adapter requires apiKey');
      }
      return new CraftAdapter({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        timeout: config.timeout,
      });

    case 'payload':
      return new PayloadAdapter({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        email: config.username,
        password: config.password,
        timeout: config.timeout,
      });

    case 'wordpress':
      return new WordPressAdapter({
        baseUrl: config.baseUrl,
        username: config.username,
        applicationPassword: config.password,
        timeout: config.timeout,
      });
  }
}
