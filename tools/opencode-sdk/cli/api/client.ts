import { Configuration, DefaultApi } from '../../index.js';

export interface CliOptions {
  server: string;
  output: 'table' | 'json';
  debug: boolean;
}

const DEFAULT_SERVER = 'http://127.0.0.1:3456';

let _api: DefaultApi | null = null;
let _options: CliOptions = {
  server: DEFAULT_SERVER,
  output: 'table',
  debug: false,
};

export function setOptions(options: Partial<CliOptions>): void {
  _options = { ..._options, ...options };
  _api = null; // Reset API client when options change
}

export function getOptions(): CliOptions {
  return { ..._options };
}

export function getApi(): DefaultApi {
  if (!_api) {
    const config = new Configuration({
      basePath: _options.server,
    });
    _api = new DefaultApi(config);
  }
  return _api;
}