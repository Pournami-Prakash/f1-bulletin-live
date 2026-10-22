import type { Instrumentation } from 'next';
import { logEvent } from '@/lib/observability';

export const onRequestError: Instrumentation.onRequestError = (_error, request, context) => {
  const id = request.headers['x-request-id'];
  logEvent('error', 'unhandled_request_error', {
    requestId: typeof id === 'string' ? id : null,
    route: context.routePath,
    method: request.method,
    routeType: context.routeType,
  });
};
