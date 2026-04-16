import { describe, it, expect } from 'vitest';
import { resolveExporter, listExporters } from '../scripts/lib/exporters/registry';

describe('exporters/registry', () => {
  it('등록된 exporter 목록을 반환해야 한다', () => {
    const exporters = listExporters();
    expect(exporters.length).toBeGreaterThanOrEqual(4);
    const formats = exporters.map((e) => e.format);
    expect(formats).toContain('html');
    expect(formats).toContain('openapi');
    expect(formats).toContain('postman');
    expect(formats).toContain('json-raw');
  });

  it('.html 확장자에 HTML exporter를 반환해야 한다', () => {
    const exporter = resolveExporter('output/api.html');
    expect(exporter.format).toBe('html');
  });

  it('.yaml 확장자에 OpenAPI exporter를 반환해야 한다', () => {
    const exporter = resolveExporter('output/api.yaml');
    expect(exporter.format).toBe('openapi');
  });

  it('.yml 확장자에 OpenAPI exporter를 반환해야 한다', () => {
    const exporter = resolveExporter('output/api.yml');
    expect(exporter.format).toBe('openapi');
  });

  it('.api.json 확장자에 json-raw exporter를 반환해야 한다', () => {
    const exporter = resolveExporter('output/snapshot.api.json');
    expect(exporter.format).toBe('json-raw');
  });

  it('.json 확장자에 postman exporter를 반환해야 한다', () => {
    const exporter = resolveExporter('output/collection.json');
    expect(exporter.format).toBe('postman');
  });

  it('formatHint가 확장자보다 우선해야 한다', () => {
    const exporter = resolveExporter('output/api.html', 'openapi');
    expect(exporter.format).toBe('openapi');
  });

  it('알 수 없는 확장자에 HTML fallback을 반환해야 한다', () => {
    const exporter = resolveExporter('output/api.txt');
    expect(exporter.format).toBe('html');
  });
});
