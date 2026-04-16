import { DocExporter, DocMeta } from './types';
import { ApiEntry, generateHtml } from '../html-generator';
import { ClientApiEntry } from '../client-api-scanner';

/**
 * HTML 내보내기 — 기존 html-generator.ts 래핑
 */
export class HtmlExporter implements DocExporter {
  format = 'html';
  extension = 'html';

  generate(
    serverEntries: ApiEntry[],
    clientEntries: ClientApiEntry[],
    meta: DocMeta
  ): string {
    return generateHtml(serverEntries, clientEntries, meta.projectName);
  }
}
