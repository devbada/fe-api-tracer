import { ApiEntry } from '../html-generator';
import { ClientApiEntry } from '../client-api-scanner';

export interface DocMeta {
  projectName: string;
  generatedAt: string;
  version?: string;
}

/**
 * 문서 내보내기 인터페이스
 * 새 포맷 지원 시 이 인터페이스를 구현하고 registry.ts에 등록
 */
export interface DocExporter {
  format: string;
  extension: string;
  generate(
    serverEntries: ApiEntry[],
    clientEntries: ClientApiEntry[],
    meta: DocMeta
  ): string;
}
