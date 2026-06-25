import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

describe("ErrorBoundary", () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Suppress console.error during tests so we don't pollute test output with expected errors
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore original console.error
    console.error = originalConsoleError;
  });

  it("should render children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Normal Component</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Normal Component")).toBeInTheDocument();
  });

  it("should render fallback UI when a child throws an error", () => {
    const ThrowingComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // Verify the fallback UI is displayed
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("TERMINAL ERROR")).toBeInTheDocument();
    expect(screen.getByText("The archive interface faulted. Refresh to continue.")).toBeInTheDocument();

    // Verify console.error was called by React (internally logging the error)
    // and by our component. Our component should be the second call (or we can just check if any call matches).
    expect(console.error).toHaveBeenCalled();
    const mockCalls = (console.error as ReturnType<typeof vi.fn>).mock.calls;

    // Find the call from our ErrorBoundary
    const ourCall = mockCalls.find(call => call[0] === "[ErrorBoundary] UI render error:");
    expect(ourCall).toBeDefined();
    if (ourCall) {
      expect(ourCall[1]).toBeInstanceOf(Error);
      expect(ourCall[1].message).toBe("Test error");
    }
  });
});
