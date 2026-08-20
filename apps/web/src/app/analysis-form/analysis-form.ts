import { Component, input, output, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import type { AnalysisRequest } from '../analysis-report.dto';

/**
 * Client-side hint only: a quick, non-authoritative sanity check mirroring
 * apps/api/src/http/analysis-request-schema.ts (parseGitHubRepositoryUrl).
 * The backend's own validation remains the final contract authority.
 */
const GITHUB_HOSTNAME = 'github.com';
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+$/;

function isValidGitHubRepositoryUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== GITHUB_HOSTNAME ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0
  ) {
    return false;
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    return false;
  }

  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length !== 2) {
    return false;
  }

  const [owner, repo] = segments as [string, string];
  return GITHUB_OWNER_PATTERN.test(owner) && GITHUB_REPOSITORY_PATTERN.test(repo);
}

function githubRepositoryUrlValidator(): ValidatorFn {
  return (control): ValidationErrors | null => {
    const value = ((control.value as string | null) ?? '').trim();
    if (value.length === 0) {
      return null;
    }
    return isValidGitHubRepositoryUrl(value) ? null : { githubRepositoryUrl: true };
  };
}

@Component({
  selector: 'app-analysis-form',
  imports: [ReactiveFormsModule],
  templateUrl: './analysis-form.html',
  styleUrl: './analysis-form.css',
})
export class AnalysisForm {
  readonly disabled = input(false);
  readonly submitRequest = output<AnalysisRequest>();
  readonly invalidSubmit = output<void>();

  protected readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    repositoryUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, githubRepositoryUrlValidator()],
    }),
    targetBranch: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected showError(controlName: 'repositoryUrl' | 'targetBranch'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  protected onSubmit(): void {
    if (this.disabled()) {
      return;
    }
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.invalidSubmit.emit();
      return;
    }
    const value = this.form.getRawValue();
    this.submitRequest.emit({
      repositoryUrl: value.repositoryUrl.trim(),
      targetBranch: value.targetBranch.trim(),
    });
  }
}
