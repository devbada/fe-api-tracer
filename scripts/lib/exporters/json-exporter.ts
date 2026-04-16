import { DocExporter, DocMeta } from './types';
import { ApiEntry } from '../html-generator';
import { ClientApiEntry } from '../client-api-scanner';

/**
 * 중간 JSON 데이터 내보내기
 * CI diff 모드(Phase 6)의 스냅샷 기반으로 활용됩니다.
 */
export class JsonExporter implements DocExporter {
  format = 'json-raw';
  extension = 'api.json';

  generate(
    serverEntries: ApiEntry[],
    clientEntries: ClientApiEntry[],
    meta: DocMeta
  ): string {
    return JSON.stringify({
      meta,
      server: serverEntries.map((e) => ({
        route: e.route.routePath,
        methods: e.endpoint.methods,
        description: e.endpoint.description,
        params: e.endpoint.params,
        returns: e.endpoint.returns,
        source: e.route.relativePath,
      })),
      client: clientEntries.map((e) => ({
        method: e.method,
        url: e.url,
        description: e.description,
        params: e.params,
        returns: e.returns,
        source: e.sourceFile,
        functionName: e.functionName,
        group: e.group,
        usage: e.usageChain,
      })),
    }, null, 2);
  }
}
