"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "../lib/api";

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'requests'>('leaderboard');
  const [stats, setStats] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      loadStats();
    } else {
      loadRequests();
    }
  }, [activeTab]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/stats/users');
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/requests');
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if(!confirm('Bu talebi onaylamak istediğinize emin misiniz?')) return;
    try {
      await fetchAPI(`/requests/${id}/approve`, { method: 'POST' });
      loadRequests();
    } catch(err) {
      alert('Hata oluştu.');
    }
  };

  const handleReject = async (id: number) => {
    if(!confirm('Bu talebi reddetmek istediğinize emin misiniz?')) return;
    try {
      await fetchAPI(`/requests/${id}/reject`, { method: 'POST' });
      loadRequests();
    } catch(err) {
      alert('Hata oluştu.');
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('leaderboard')}
          className="btn" 
          style={{ background: activeTab === 'leaderboard' ? 'var(--accent-color)' : 'transparent', color: activeTab === 'leaderboard' ? '#000' : 'var(--text-color)', border: activeTab === 'leaderboard' ? 'none' : '1px solid var(--border-color)' }}
        >
          🏆 Liderlik Tablosu
        </button>
        <button 
          onClick={() => setActiveTab('requests')}
          className="btn" 
          style={{ background: activeTab === 'requests' ? 'var(--accent-color)' : 'transparent', color: activeTab === 'requests' ? '#000' : 'var(--text-color)', border: activeTab === 'requests' ? 'none' : '1px solid var(--border-color)' }}
        >
          📥 Bekleyen Talepler {requests.length > 0 && `(${requests.length})`}
        </button>
      </div>

      {activeTab === 'leaderboard' && (
        <>
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--accent-color)' }}>👑 Liderlik Tablosu</h2>
          <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
            Aşağıdaki tablo sistemde en çok veri (müdahale) giren kullanıcıları listeler. Silinen veriler hesaplamaya dahil edilmez.
          </p>

          {loading ? (
            <div>Yükleniyor...</div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Sıra</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Kullanıcı Adı</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Girilen Veri Sayısı</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat, index) => (
                    <tr key={stat.username} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem' }}>
                        {index === 0 ? '🥇 1.' : index === 1 ? '🥈 2.' : index === 2 ? '🥉 3.' : `${index + 1}.`}
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 'bold' }}>{stat.username}</td>
                      <td style={{ padding: '1rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>{stat.count}</td>
                    </tr>
                  ))}
                  {stats.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Veri bulunamadı.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'requests' && (
        <>
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--accent-color)' }}>📥 Kullanıcı Talepleri</h2>
          <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
            Kullanıcılar başkalarının girdiği verileri silemez veya güncelleyemez. Buradan onların gönderdiği talepleri onaylayabilir veya reddedebilirsiniz.
          </p>

          {loading ? (
            <div>Yükleniyor...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {requests.map((req) => (
                <div key={req.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{req.asset_id}</span>
                      <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>{req.category}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Talep eden: <strong style={{ color: 'var(--accent-color)' }}>{req.requested_by}</strong> ({new Date(req.created_at).toLocaleString('tr-TR')})
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ padding: '0.2rem 0.5rem', background: req.request_type === 'DELETE' ? 'rgba(239,68,68,0.2)' : 'rgba(96,165,250,0.2)', color: req.request_type === 'DELETE' ? '#ef4444' : '#60a5fa', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {req.request_type === 'DELETE' ? 'SİLME TALEBİ' : 'DÜZENLEME TALEBİ'}
                    </span>
                    
                    {req.request_type === 'UPDATE' && req.new_data && (
                      <div style={{ fontSize: '0.9rem', flex: 1, minWidth: '100%' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '4px', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 45%', opacity: 0.6 }}>
                            <strong>Eski:</strong> {req.old_status}
                            {req.old_description && <div>{req.old_description}</div>}
                          </div>
                          <div style={{ fontSize: '1.5rem', opacity: 0.5 }}>➔</div>
                          <div style={{ flex: '1 1 45%' }}>
                            <strong>Yeni:</strong> {JSON.parse(req.new_data).status || req.old_status}
                            {JSON.parse(req.new_data).description !== undefined && <div>{JSON.parse(req.new_data).description}</div>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button onClick={() => handleReject(req.id)} className="btn" style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}>❌ Reddet</button>
                    <button onClick={() => handleApprove(req.id)} className="btn" style={{ background: '#10b981', color: '#000', border: 'none' }}>✅ Onayla</button>
                  </div>
                </div>
              ))}
              {requests.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Bekleyen talep yok.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
