"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-shell">
      <h1>That action could not be completed</h1>
      <p className="header-description">{error.message}</p>
      <button className="button button-primary" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
