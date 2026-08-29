/**
 * Root not-found page. Renders when a Route Handler / RSC calls
 * `notFound()` or when Next can't match a URL to a page.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-serif text-4xl font-bold">Not found</h1>
      <p className="text-neutral-600">
        We couldn&apos;t find what you were looking for.
      </p>
    </main>
  );
}
