// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from '../ErrorBoundary';

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error so our test output stays clean
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test Child</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws an error', () => {
    const ThrowingChild = () => {
      throw new Error('Test Error');
    };

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );

    // Verify the fallback UI is rendered
    expect(screen.getByText('TERMINAL ERROR')).toBeInTheDocument();
    expect(screen.getByText('The archive interface faulted. Refresh to continue.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Verify console.error was called
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
