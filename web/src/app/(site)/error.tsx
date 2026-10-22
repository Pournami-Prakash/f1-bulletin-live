'use client';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main style={{ padding: '80px 24px', maxWidth: 640, margin: 'auto' }}>
    <h1>This page could not be loaded</h1>
    <p>Please try again in a moment.</p>
    <button onClick={retry}>Try again</button>
  </main>;
}
