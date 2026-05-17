'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) router.replace('/');
  }, [loading, isAuthenticated, router]);

  const handleRegister = async () => {
    if (!email || !password || !fullName) { setError('Name, email and password required.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await api.register(email, password, fullName, company || undefined);
      await api.login(email, password);
      router.replace('/');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117', fontFamily: 'sans-serif' }}>
      <div style={{ width: 360, background: '#161b27', border: '1px solid #1e293b', borderRadius: 12, padding: 32 }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>📋</div>
          <h1 style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700 }}>Create Account</h1>
          <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Amaryllis Success BOQ Generator</p>
        </div>
        {error && <div style={{ background: '#450a0a', color: '#fca5a5', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="text" placeholder="Full Name *" value={fullName}
            onChange={e => setFullName(e.target.value)}
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, outline: 'none' }} />
          <input type="email" placeholder="Email *" value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, outline: 'none' }} />
          <input type="password" placeholder="Password *" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegister()}
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, outline: 'none' }} />
          <input type="text" placeholder="Company (optional)" value={company}
            onChange={e => setCompany(e.target.value)}
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, outline: 'none' }} />
          <button onClick={handleRegister} disabled={submitting}
            style={{ background: '#f59e0b', color: '#0f1117', border: 'none', borderRadius: 6, padding: '11px', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </div>
        <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
          Already have an account? <a href="/auth/login" style={{ color: '#f59e0b' }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
