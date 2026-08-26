export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-serif text-5xl font-bold tracking-tight">
        Medium-Alt
      </h1>
      <p className="text-muted-foreground max-w-md text-lg">
        A writing platform under construction — substrate for practicing an E2E
        automation framework and agentic PR review.
      </p>
      <p className="text-muted-foreground text-sm">
        See <code className="rounded bg-muted px-1.5 py-0.5">docs/architecture.md</code> for the roadmap.
      </p>
    </main>
  );
}
