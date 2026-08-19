import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const validEnv = {
  GITHUB_TOKEN: 'gh-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
  CLAUDE_MODEL: 'claude-test-model',
};

describe('loadConfig', () => {
  it('loads valid configuration and applies the default port', () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      githubToken: 'gh-token',
      anthropicApiKey: 'anthropic-key',
      claudeModel: 'claude-test-model',
      port: 3000,
    });
  });

  it('coerces and accepts an explicit port', () => {
    const config = loadConfig({ ...validEnv, PORT: '4100' });

    expect(config.port).toBe(4100);
  });

  it('throws a descriptive error, naming only the missing variable, when GITHUB_TOKEN is missing', () => {
    expect(() =>
      loadConfig({ ANTHROPIC_API_KEY: validEnv.ANTHROPIC_API_KEY, CLAUDE_MODEL: validEnv.CLAUDE_MODEL }),
    ).toThrow(/githubToken/);
  });

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    expect(() =>
      loadConfig({ GITHUB_TOKEN: validEnv.GITHUB_TOKEN, CLAUDE_MODEL: validEnv.CLAUDE_MODEL }),
    ).toThrow(/anthropicApiKey/);
  });

  it('throws when CLAUDE_MODEL is missing', () => {
    expect(() =>
      loadConfig({ GITHUB_TOKEN: validEnv.GITHUB_TOKEN, ANTHROPIC_API_KEY: validEnv.ANTHROPIC_API_KEY }),
    ).toThrow(/claudeModel/);
  });

  it('throws for a non-numeric port rather than silently ignoring it', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'not-a-number' })).toThrow(/port/);
  });

  it('never includes the secret values themselves in the thrown error message', () => {
    expect.assertions(1);
    try {
      loadConfig({ ANTHROPIC_API_KEY: 'super-secret-value', CLAUDE_MODEL: 'model' });
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-value');
    }
  });
});
