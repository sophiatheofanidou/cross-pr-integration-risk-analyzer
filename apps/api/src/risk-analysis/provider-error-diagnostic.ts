/** Bounded, provider-neutral diagnostics extracted from an external provider error. */
export interface SanitizedProviderErrorDiagnostic {
  readonly errorName: string;
  readonly failureReason?: string;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly providerErrorType?: string;
  readonly providerMessage?: string;
}

function optionalProperty(error: unknown, property: string): unknown {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[property]
    : undefined;
}

/**
 * Extracts only bounded operational fields. Provider request payloads, prompts,
 * response bodies and credentials are deliberately excluded.
 */
export function sanitizeProviderError(error: unknown): SanitizedProviderErrorDiagnostic {
  const failureReason = optionalProperty(error, 'reason');
  const requestId =
    optionalProperty(error, 'requestId') ??
    optionalProperty(error, 'requestID') ??
    optionalProperty(error, 'request_id') ??
    optionalProperty(error, '_request_id');
  const httpStatus = optionalProperty(error, 'status');
  const responseBody = optionalProperty(error, 'error');
  const nestedResponseError = optionalProperty(responseBody, 'error');
  const responseError = nestedResponseError ?? responseBody;
  const providerErrorType =
    optionalProperty(responseError, 'type') ?? optionalProperty(error, 'type');
  const rawProviderMessage = optionalProperty(responseError, 'message');
  const providerMessage =
    typeof rawProviderMessage === 'string'
      ? rawProviderMessage.replace(/\s+/g, ' ').trim().slice(0, 600)
      : undefined;

  return {
    errorName: error instanceof Error ? error.name : 'UnknownProviderError',
    ...(typeof failureReason === 'string' ? { failureReason } : {}),
    ...(typeof requestId === 'string' ? { requestId } : {}),
    ...(typeof httpStatus === 'number' ? { httpStatus } : {}),
    ...(typeof providerErrorType === 'string' ? { providerErrorType } : {}),
    ...(providerMessage !== undefined && providerMessage.length > 0 ? { providerMessage } : {}),
  };
}

/** Formats the safe provider fields for console and local HTML reporting. */
export function providerFailureDetail(
  diagnostic: SanitizedProviderErrorDiagnostic,
): string | undefined {
  const parts = [
    diagnostic.httpStatus === undefined ? undefined : `HTTP ${diagnostic.httpStatus}`,
    diagnostic.providerErrorType,
    diagnostic.providerMessage,
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length === 0 ? undefined : parts.join(' · ');
}
