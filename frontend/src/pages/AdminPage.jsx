import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, Lock, RefreshCcw } from 'lucide-react';
import Alert from '../components/Alert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { adminLogin, getSubmissions, verifySubmission } from '../services/api.js';

function formatSubmissionAddress(item) {
  const line = [item.house_no, item.street, item.area, item.town, item.district, item.state, item.pin, item.rehbar].filter(Boolean).join(', ');
  if (line && item.address) return `${line}. ${item.address}`;
  if (line) return line;
  if (item.address) return item.address;
  return [item.state, item.pin].filter(Boolean).join(' - ') || '-';
}

export default function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [filter, setFilter] = useState('all');
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const counts = useMemo(() => ({
    all: submissions.length,
    pending: submissions.filter((item) => item.payment_status === 'pending').length,
    verified: submissions.filter((item) => item.payment_status === 'verified').length
  }), [submissions]);

  const visibleSubmissions = useMemo(() => {
    if (filter === 'all') return submissions;
    return submissions.filter((item) => item.payment_status === filter);
  }, [filter, submissions]);

  async function loadSubmissions(activeToken = token) {
    if (!activeToken) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await getSubmissions(activeToken);
      setSubmissions(data.submissions);
    } catch (err) {
      setError(err.message);
      if (err.message.toLowerCase().includes('admin')) {
        localStorage.removeItem('adminToken');
        setToken('');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await adminLogin({ email, password });
      localStorage.setItem('adminToken', data.token);
      setToken(data.token);
      setEmail('');
      setPassword('');
      await loadSubmissions(data.token);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleVerify(id) {
    setError('');
    try {
      await verifySubmission(token, id);
      await loadSubmissions();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadSubmissions();
  }, [token]);

  if (!token) {
    return (
      <main className="page-shell">
        <section className="content-wrap flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <form onSubmit={handleLogin} className="card w-full max-w-md space-y-5 p-6 sm:p-8">
            <div className="text-center">
              <Lock className="mx-auto mb-4 text-primary" size={52} />
              <h1 className="text-3xl font-black text-ink">Admin Login</h1>
              <p className="mt-2 text-muted">Sign in with the admin email and password to review submissions.</p>
            </div>
            {error ? <Alert>{error}</Alert> : null}
            <label className="block">
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn-primary w-full" type="submit">Login</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="content-wrap py-8">
        <PageHeader eyebrow="Admin Panel" title="Payment submissions" description="Review pending submissions, inspect uploaded screenshots, and mark completed payments as verified." />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg border border-ink/10 bg-white p-1 shadow-sm">
            {['all', 'pending', 'verified'].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`rounded-md px-4 py-2 text-sm font-bold capitalize transition ${filter === item ? 'bg-primary text-white' : 'text-muted hover:bg-primary/10'}`}
              >
                {item} ({counts[item]})
              </button>
            ))}
          </div>
          <button className="btn-secondary" onClick={() => loadSubmissions()} disabled={isLoading}>
            <RefreshCcw size={18} /> {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error ? <div className="mb-5"><Alert>{error}</Alert></div> : null}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-brand-surface text-ink">
                <tr>
                  <th className="px-4 py-4 font-black">Name</th>
                  <th className="px-4 py-4 font-black">Contact</th>
                  <th className="px-4 py-4 font-black">Address</th>
                  <th className="px-4 py-4 font-black">Subscription</th>
                  <th className="px-4 py-4 font-black">Transaction</th>
                  <th className="px-4 py-4 font-black">Status</th>
                  <th className="px-4 py-4 font-black">Screenshot</th>
                  <th className="px-4 py-4 font-black">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleSubmissions.map((item) => (
                  <tr key={item.id} className="border-t border-ink/10 align-top">
                    <td className="px-4 py-4">
                      <p className="font-bold text-ink">{item.name || 'Not submitted'}</p>
                      {item.gender ? <p className="text-xs capitalize text-muted">Gender: {item.gender}</p> : null}
                      <p className="text-xs text-muted">{new Date(item.created_at).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-4 text-muted">
                      <p>{item.mobile || '-'}</p>
                      <p>{item.email || '-'}</p>
                    </td>
                    <td className="max-w-72 px-4 py-4 text-muted">
                      <p className="whitespace-pre-wrap break-words">{formatSubmissionAddress(item)}</p>
                    </td>
                    <td className="max-w-[14rem] px-4 py-4 text-xs font-semibold capitalize text-ink">
                      <p>
                        {item.subscription_type === 'five_year'
                          ? '5 year'
                          : item.subscription_type === 'yearly'
                            ? 'One year'
                            : item.subscription_type || '-'}
                      </p>
                      {item.anand_sandesh_lang ? (
                        <p className="mt-1 font-normal normal-case text-muted">
                          Anand Sandesh: {item.anand_sandesh_lang}
                        </p>
                      ) : null}
                      {item.spiritual_bliss === 'english' ? (
                        <p className="mt-0.5 font-normal normal-case text-muted">Spiritual Bliss: English</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-medium text-ink">{item.transaction_id || '-'}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                          item.payment_status === 'verified'
                            ? 'bg-primary/20 text-[#0d2d7f]'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {item.screenshot_url ? (
                        <a className="btn-secondary min-h-10 px-3 py-2 text-xs" href={item.screenshot_url} target="_blank" rel="noreferrer">
                          <Eye size={15} /> View
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-4">
                      {item.payment_status !== 'verified' ? (
                        <button className="btn-primary min-h-10 px-3 py-2 text-xs" onClick={() => handleVerify(item.id)}>
                          <Check size={15} /> Mark as Verified
                        </button>
                      ) : (
                        <span className="font-semibold text-muted">Done</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!visibleSubmissions.length ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-10 text-center font-semibold text-muted">
                      {isLoading ? 'Loading submissions...' : 'No submissions found.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
