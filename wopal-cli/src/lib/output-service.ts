import type { ConfigService } from "./config.js";

export interface OutputOptions {
  showHeader?: boolean;
  jsonIndent?: number;
}

export interface JsonResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
  };
}

export class OutputService {
  private static instance: OutputService;

  private config: ConfigService;
  private showHeader = true;
  private headerShown = false;
  private jsonIndent = 2;

  private constructor(config: ConfigService) {
    this.config = config;
  }

  static init(config: ConfigService): void {
    this.instance = new OutputService(config);
  }

  static get(): OutputService {
    if (!this.instance) {
      throw new Error(
        "OutputService not initialized. Call OutputService.init() first.",
      );
    }
    return this.instance;
  }

  static reset(): void {
    if (this.instance) {
      this.instance.headerShown = false;
      this.instance.showHeader = true;
    }
  }

  setMode(options: OutputOptions): void {
    if (options.showHeader !== undefined) {
      this.showHeader = options.showHeader;
    }
    if (options.jsonIndent !== undefined) {
      this.jsonIndent = options.jsonIndent;
    }
  }

  print(message: string): void {
    this.ensureHeader();
    console.log(message);
  }

  println(): void {
    console.log();
  }

  json<T>(data: T): void {
    const response: JsonResponse<T> = {
      success: true,
      data,
    };
    console.log(JSON.stringify(response, null, this.jsonIndent));
  }

  jsonError(code: string, message: string, suggestion?: string): void {
    const response: JsonResponse<never> = {
      success: false,
      error: { code, message, suggestion },
    };
    console.log(JSON.stringify(response, null, this.jsonIndent));
  }

  error(message: string, suggestion?: string): void {
    this.ensureHeader();
    console.error(`Error: ${message}`);
    if (suggestion) {
      console.error(`\n${suggestion}`);
    }
  }

  table<T extends Record<string, unknown>>(
    data: T[],
    columns: Array<{ key: keyof T; header: string; width?: number }>,
  ): void {
    this.ensureHeader();

    if (data.length === 0) {
      console.log("(none)");
      return;
    }

    const widths = columns.map((col) => {
      const headerLen = col.header.length;
      const maxDataLen = Math.max(
        ...data.map((row) => String(row[col.key] ?? "").length),
      );
      return col.width ?? Math.max(headerLen, maxDataLen);
    });

    const headerLine = columns
      .map((col, i) => col.header.padEnd(widths[i]!))
      .join("  ");
    console.log(headerLine);

    const separatorLine = widths.map((w) => "-".repeat(w)).join("  ");
    console.log(separatorLine);

    for (const row of data) {
      const dataLine = columns
        .map((col, i) => String(row[col.key] ?? "").padEnd(widths[i]!))
        .join("  ");
      console.log(dataLine);
    }
  }

  private ensureHeader(): void {
    if (!this.showHeader || this.headerShown) return;

    const space = this.config.getActiveSpace();
    if (space) {
      console.log(`ACTIVE SPACE: ${space.path}\n`);
    } else {
      console.log(`ACTIVE SPACE: (none)\n`);
    }
    this.headerShown = true;
  }
}
