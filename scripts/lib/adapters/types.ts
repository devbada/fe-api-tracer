import { RouteFile } from '../file-scanner';
import { ParsedEndpoint } from '../ast-parser';

/**
 * 프레임워크별 서버 라우트 스캔 어댑터 인터페이스
 *
 * 새 프레임워크 지원 시 이 인터페이스를 구현하고
 * registry.ts에 등록하면 됩니다.
 */
export interface FrameworkAdapter {
  /** 어댑터 식별자 (config.framework 값과 매칭) */
  name: string;

  /** 이 어댑터가 해당 프로젝트에 적용 가능한지 감지 */
  detect(projectRoot: string): boolean;

  /** 서버 라우트 파일 스캔 — RouteFile[] 반환 */
  scanApiRoutes(projectRoot: string): RouteFile[];

  /** 라우트 파일에서 HTTP 메서드 + JSDoc 추출 */
  parseRouteFile(filePath: string): ParsedEndpoint;
}
