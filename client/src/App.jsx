import { useEffect, useState } from 'react';

export default function App() {
  // status: 'loading' | 'ok' | 'error'
  const [status, setStatus] = useState('loading');
  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error('Bad response');
        return res.json();
      })
      .then((data) => {
        setInfo(data);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="page">
      <h1>📦 Advanced Dropbox</h1>

      {status === 'loading' && (
        <p className="box">Connecting to the server...</p>
      )}

      {status === 'ok' && (
        <p className="box ok">
          ✅ Backend connected: {info.message}
        </p>
      )}

      {status === 'error' && (
        <p className="box error">
          ❌ Cannot reach the backend. Is it running on port 3000?
        </p>
      )}
    </div>
  );
}