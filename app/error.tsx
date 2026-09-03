"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-shell">
      <h1>That action could not be completed</h1>
      <p className="header-description">
        The workbench could not finish that step. Try again, or restart from a clean terminal using
        the documented demo startup commands.
      </p>
      <button className="button button-primary" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
