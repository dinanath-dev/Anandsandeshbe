export default function Alert({ type = 'error', children }) {
  const styles =
    type === 'success'
      ? 'border-primary/40 bg-primary/10 text-[#0d2d7f]'
      : 'border-red-200 bg-red-50 text-red-700';

  return <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${styles}`}>{children}</div>;
}
