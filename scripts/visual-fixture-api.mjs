// Development-only, key-free API fixture for repeatable UI acceptance checks.
// The production backend never imports or starts this server.
import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.FIXTURE_PORT ?? '3000', 10);
const DEMO_REPOSITORY = 'https://github.com/acme/payments-platform';
const retryAttempts = new Map();

const pullRequests = [
  { id: '184', title: 'Require currency in processPayment', webUrl: `${DEMO_REPOSITORY}/pull/184`, sourceBranch: 'feat/payment-currency', targetBranch: 'development', changedFileCount: 4 },
  { id: '191', title: 'Add invoice settlement handler', webUrl: `${DEMO_REPOSITORY}/pull/191`, sourceBranch: 'feat/invoice-settlement', targetBranch: 'development', changedFileCount: 3 },
  { id: '197', title: 'Add upload handler', webUrl: `${DEMO_REPOSITORY}/pull/197`, sourceBranch: 'feat/upload-handler', targetBranch: 'development', changedFileCount: 2 },
  { id: '203', title: 'Add webhook handler', webUrl: `${DEMO_REPOSITORY}/pull/203`, sourceBranch: 'feat/webhook-handler', targetBranch: 'development', changedFileCount: 5 },
];

function compact(index) {
  const { id, title, webUrl } = pullRequests[index];
  return { id, title, webUrl };
}

function location(pullRequestId, filePath, line) {
  return {
    pullRequestId,
    filePath,
    range: { start: { line, column: 1 }, end: { line, column: 20 } },
  };
}

function match(term, changedPullRequestId, changedFile, changedLine, matchingPullRequestId, matchingFile, matchingLine) {
  return {
    technicalTerm: term,
    changedRegionLocation: location(changedPullRequestId, changedFile, changedLine),
    matchingOccurrenceLocation: location(matchingPullRequestId, matchingFile, matchingLine),
  };
}

function fullReport(targetBranch) {
  return {
    repositoryUrl: DEMO_REPOSITORY,
    targetBranch,
    status: 'COMPLETED_WITH_WARNINGS',
    summary: {
      eligiblePullRequestCount: 4,
      possiblePairCount: 6,
      candidatePairCount: 4,
      assessedPairCount: 3,
      riskIdentifiedCount: 2,
      notAssessedCount: 1,
      noRiskIdentifiedCount: 1,
    },
    eligiblePullRequests: pullRequests.map((pullRequest) => ({ ...pullRequest, targetBranch })),
    candidatePairs: [
      {
        pullRequestA: compact(0),
        pullRequestB: compact(1),
        technicalTermMatches: [
          match('processPayment', '184', 'src/payment.service.ts', 18, '191', 'src/settlement.ts', 42),
          match('PaymentRequest', '184', 'src/payment.types.ts', 9, '191', 'src/settlement.ts', 35),
        ],
        assessment: {
          state: 'COMPLETED',
          result: {
            status: 'RISK_IDENTIFIED',
            likelyOutcome: 'Invoice settlement may fail when processing a payment.',
            pullRequestAContribution: 'Changes processPayment so every payment requires an explicit currency.',
            pullRequestBContribution: 'Adds invoice settlement using an amount without supplying the newly required currency.',
            combinedEffect: 'The settlement path may call the updated payment contract without required data, preventing the payment from completing successfully.',
            relevantCode: {
              pullRequestA: [{ pullRequestId: '184', technicalTerm: 'processPayment', filePath: 'src/payment.service.ts', startLine: 18 }],
              pullRequestB: [{ pullRequestId: '191', technicalTerm: 'processPayment', filePath: 'src/settlement.ts', startLine: 42 }],
            },
            reviewerAction: 'Check src/settlement.ts and ensure invoice.currency is passed through PaymentRequest to processPayment.',
            confidence: 'HIGH',
            severity: 'HIGH',
          },
        },
      },
      {
        pullRequestA: compact(0),
        pullRequestB: compact(3),
        technicalTermMatches: [match('processPayment', '184', 'src/payment.service.ts', 18, '203', 'src/webhook.ts', 36)],
        assessment: {
          state: 'COMPLETED',
          result: {
            status: 'RISK_IDENTIFIED',
            likelyOutcome: 'Webhook payment processing may fail.',
            pullRequestAContribution: 'Requires processPayment callers to supply a currency.',
            pullRequestBContribution: 'Adds a webhook path that passes only the event amount.',
            combinedEffect: 'The new webhook caller may not satisfy the updated payment contract.',
            relevantCode: {
              pullRequestA: [{ pullRequestId: '184', technicalTerm: 'processPayment', filePath: 'src/payment.service.ts', startLine: 18 }],
              pullRequestB: [{ pullRequestId: '203', technicalTerm: 'processPayment', filePath: 'src/webhook.ts', startLine: 36 }],
            },
            reviewerAction: 'Check src/webhook.ts and map the webhook currency into the processPayment call.',
            confidence: 'MEDIUM',
            severity: 'MEDIUM',
          },
        },
      },
      {
        pullRequestA: compact(1),
        pullRequestB: compact(3),
        technicalTermMatches: [match('PaymentEvent', '191', 'src/events.ts', 14, '203', 'src/webhook.ts', 28)],
        assessment: {
          state: 'NOT_RUN',
          reason: 'INSUFFICIENT_CONTEXT',
          message: 'A Technical Term Match was found, but the matching source context could not be retained reliably. No assessment conclusion was produced.',
        },
      },
      {
        pullRequestA: compact(2),
        pullRequestB: compact(3),
        technicalTermMatches: [match('handler', '197', 'src/upload.ts', 7, '203', 'src/webhook.ts', 11)],
        assessment: {
          state: 'COMPLETED',
          result: {
            status: 'NO_RISK_IDENTIFIED',
            relationshipSummary: 'Both pull requests contain the shared technical term handler.',
            independenceReason: 'The supplied handlers are local functions with unrelated inputs and responsibilities.',
            coverageLimitation: 'One unsupported file was outside the bounded TypeScript analysis.',
            confidence: 'MEDIUM',
          },
        },
      },
    ],
    warnings: [
      {
        pullRequestId: '184',
        filePath: 'src/legacy/refund.js',
        reason: 'UNSUPPORTED_FILE_EXTENSION',
        message: 'This JavaScript file was skipped because the MVP analyzes TypeScript .ts files. Supported files in PR #184 were still analyzed.',
      },
      {
        pullRequestId: '191',
        relatedPullRequestId: '203',
        reason: 'ASSESSMENT_NOT_RUN',
        message: 'Risk assessment was not run because sufficient matching source context was unavailable.',
      },
    ],
  };
}

function emptyReport() {
  return {
    repositoryUrl: DEMO_REPOSITORY,
    targetBranch: 'empty',
    status: 'COMPLETED',
    summary: {
      eligiblePullRequestCount: 2,
      possiblePairCount: 1,
      candidatePairCount: 0,
      assessedPairCount: 0,
      riskIdentifiedCount: 0,
      notAssessedCount: 0,
      noRiskIdentifiedCount: 0,
    },
    eligiblePullRequests: pullRequests.slice(0, 2).map((pullRequest) => ({ ...pullRequest, targetBranch: 'empty' })),
    candidatePairs: [],
    warnings: [],
  };
}

function normalizedRepositoryUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '').toLowerCase()}`;
  } catch {
    return '';
  }
}

function send(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/api/analysis') {
    send(response, 404, { error: { message: 'Fixture route not found.' } });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    send(response, 400, { error: { message: 'The fixture request body must be valid JSON.' } });
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 900));

  if (normalizedRepositoryUrl(body.repositoryUrl) !== normalizedRepositoryUrl(DEMO_REPOSITORY)) {
    send(response, 404, {
      error: { message: `Visual fixture data exists only for ${DEMO_REPOSITORY}.` },
    });
    return;
  }

  if (body.targetBranch === 'failure') {
    send(response, 502, { error: { message: 'Simulated source-control provider failure.' } });
    return;
  }

  if (body.targetBranch === 'retry') {
    const attempts = (retryAttempts.get(body.repositoryUrl) ?? 0) + 1;
    retryAttempts.set(body.repositoryUrl, attempts);
    if (attempts === 1) {
      send(response, 502, { error: { message: 'Simulated first-attempt failure. Use Try again.' } });
      return;
    }
    send(response, 200, fullReport('retry'));
    return;
  }

  if (body.targetBranch === 'development') {
    send(response, 200, fullReport('development'));
    return;
  }

  if (body.targetBranch === 'empty') {
    send(response, 200, emptyReport());
    return;
  }

  send(response, 404, {
    error: { message: 'Visual fixture branches are development, empty, failure and retry.' },
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Visual fixture API listening on http://${HOST}:${PORT}`);
  console.log(`Demo repository: ${DEMO_REPOSITORY}`);
  console.log('Demo branches: development, empty, failure, retry');
});
