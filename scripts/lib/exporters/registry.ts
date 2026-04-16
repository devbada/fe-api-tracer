import * as path from 'path';
import { DocExporter } from './types';
import { HtmlExporter } from './html-exporter';
import { OpenApiExporter } from './openapi-exporter';
import { PostmanExporter } from './postman-exporter';
import { JsonExporter } from './json-exporter';

const exporters: DocExporter[] = [
  new HtmlExporter(),
  new OpenApiExporter(),
  new PostmanExporter(),
  new JsonExporter(),
];

/**
 * 출력 경로 확장자 또는 명시적 포맷 이름으로 적절한 내보내기 도구를 반환합니다.
 *
 * @param outputPath 출력 파일 경로
 * @param formatHint 명시적 포맷 힌트 (예: 'openapi', 'postman')
 * @returns 매칭된 DocExporter (fallback: HTML)
 */
export function resolveExporter(outputPath: string, formatHint?: string): DocExporter {
  // 명시적 포맷 힌트
  if (formatHint) {
    const byHint = exporters.find((e) => e.format === formatHint);
    if (byHint) return byHint;
  }

  // 확장자 기반
  const ext = path.extname(outputPath).toLowerCase().slice(1); // '.html' → 'html'
  const fileName = path.basename(outputPath).toLowerCase();

  // 특수 확장자 매칭
  if (fileName.endsWith('.api.json')) {
    return exporters.find((e) => e.format === 'json-raw')!;
  }
  if (ext === 'yaml' || ext === 'yml') {
    return exporters.find((e) => e.format === 'openapi')!;
  }

  // 일반 확장자 매칭
  const byExt = exporters.find((e) => e.extension === ext);
  if (byExt) return byExt;

  // fallback: HTML
  return exporters[0];
}

/**
 * 등록된 모든 내보내기 도구 목록
 */
export function listExporters(): DocExporter[] {
  return [...exporters];
}
