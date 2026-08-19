/**
 * Fastify composition for the M5 synchronous analysis operation.
 *
 * Server creation is deliberately separate from process startup (../main.ts)
 * so integration tests can inject fake providers and use Fastify request
 * injection without opening a network port (M5 backend prompt, section 6).
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type { AnalysisDependencies } from '../application/analysis-application-service.js';
import { runAnalysis } from '../application/analysis-application-service.js';
import { GitHubHttpError, GitHubPaginationError, GitHubResponseValidationError } from '../source-control/github/github-client.js';
import { GitHubPullRequestFileLimitExceededError } from '../source-control/github/github-source-control-provider.js';
import { analysisReportDtoSchema } from './analysis-report-response-schema.js';
import { analysisRequestSchema } from './analysis-request-schema.js';

export type ServerDependencies = AnalysisDependencies;

/** A small, sanitized error body: never a raw exception message, stack trace or credential. */
interface ErrorResponseDto {
  readonly error: {
    readonly message: string;
  };
}

/**
 * Recognizes a source-control retrieval failure raised by the concrete
 * GitHub adapter this composition root wires up, so it can be reported as an
 * upstream (502) failure rather than a generic (500) internal error. This is
 * composition-root knowledge, not a provider-neutral concept: the
 * application layer above never inspects error types.
 */
function isSourceControlRetrievalError(error: unknown): boolean {
  return (
    error instanceof GitHubHttpError ||
    error instanceof GitHubResponseValidationError ||
    error instanceof GitHubPaginationError ||
    error instanceof GitHubPullRequestFileLimitExceededError
  );
}

export function createServer(dependencies: ServerDependencies): FastifyInstance {
  const app = Fastify();

  app.post('/api/analysis', async (request, reply) => {
    const parsedRequest = analysisRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      reply.code(400);
      const response: ErrorResponseDto = {
        error: {
          message: `Invalid analysis request: ${parsedRequest.error.issues
            .map((issue) => issue.message)
            .join('; ')}`,
        },
      };
      return response;
    }

    try {
      const report = await runAnalysis(parsedRequest.data, dependencies);
      return analysisReportDtoSchema.parse(report);
    } catch (error) {
      const sourceControlFailure = isSourceControlRetrievalError(error);
      reply.code(sourceControlFailure ? 502 : 500);
      const response: ErrorResponseDto = {
        error: {
          message: sourceControlFailure
            ? 'Failed to retrieve pull request data from the source-control provider.'
            : 'An unexpected internal error occurred.',
        },
      };
      return response;
    }
  });

  return app;
}
