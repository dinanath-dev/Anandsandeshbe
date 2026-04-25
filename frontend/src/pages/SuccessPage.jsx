import { CheckCircle2, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SuccessPage() {
  return (
    <main className="page-shell">
      <section className="content-wrap flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <div className="card max-w-xl p-8 text-center sm:p-10">
          <CheckCircle2 className="mx-auto mb-5 text-primary" size={64} />
          <h1 className="text-3xl font-black text-ink sm:text-4xl">Submission received</h1>
          <p className="mt-4 leading-7 text-muted">
            Your details have been saved with pending status. An administrator may review your submission and uploaded document.
          </p>
          <Link to="/" className="btn-primary mt-7">
            <Home size={20} /> Submit another
          </Link>
        </div>
      </section>
    </main>
  );
}
