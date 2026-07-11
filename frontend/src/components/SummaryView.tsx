import React, { useState, useEffect } from 'react';
import { fetchAPI, fetchCustomStats, updateDashboardPreferences } from '../lib/api';

export default function SummaryView() {
  const [preferences, setPreferences] = useState<{type: string, name: string}[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [tenderExtras, setTenderExtras] = useState<any>(null);
  
  // For dropdowns
  const [availableOms, setAvailableOms] = useState<string[]>([]);
  const [availableIlces, setAvailableIlces] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('om');
  const [selectedValue, setSelectedValue] = useState('');

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setLoading(true);
    try {
      // Fetch user preferences
      const user = await fetchAPI('/me');
      const prefs = user.dashboard_preferences || [];
      setPreferences(prefs);
      
      // Fetch available lines to extract OMs and Ilces
      const lines = await fetchAPI('/lines');
      const oms = Array.from(new Set(lines.map((l: any) => l.operasyon_merkezi).filter(Boolean))).sort() as string[];
      const ilces = Array.from(new Set(lines.map((l: any) => l.ilce).filter(Boolean))).sort() as string[];
      setAvailableOms(oms);
      setAvailableIlces(ilces);
      
      if (oms.length > 0) setSelectedValue(oms[0]);
      
      // Load data for preferences
      loadWidgetData(prefs);

      // Load static tender extras widget
      try {
        const extras = await fetchAPI('/summary/tender-extras');
        setTenderExtras(extras);
      } catch(e) {}
      
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadWidgetData = async (prefs: {type: string, name: string}[]) => {
    const newData: Record<string, any[]> = {};
    await Promise.all(prefs.map(async (pref) => {
      const stats = await fetchCustomStats(pref.type, pref.name);
      newData[`${pref.type}_${pref.name}`] = stats;
    }));
    setWidgetData(newData);
  };

  const addWidget = async () => {
    if (!selectedValue) return;
    const exists = preferences.find(p => p.type === selectedType && p.name === selectedValue);
    if (exists) return;
    
    const newPrefs = [...preferences, { type: selectedType, name: selectedValue }];
    setPreferences(newPrefs);
    
    // Save to backend
    await updateDashboardPreferences(JSON.stringify(newPrefs));
    
    // Load new widget data
    const stats = await fetchCustomStats(selectedType, selectedValue);
    setWidgetData(prev => ({ ...prev, [`${selectedType}_${selectedValue}`]: stats }));
  };

  const removeWidget = async (type: string, name: string) => {
    const newPrefs = preferences.filter(p => !(p.type === type && p.name === name));
    setPreferences(newPrefs);
    await updateDashboardPreferences(JSON.stringify(newPrefs));
  };
  
  const renderTable = (pref: {type: string, name: string}) => {
    const data = widgetData[`${pref.type}_${pref.name}`];
    if (!data) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Veriler yükleniyor...</div>;
    
    return (
      <div style={{ background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
        <div style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1rem' }}>
            {pref.type === 'om' ? '🏢 OM: ' : '📍 İlçe: '} {pref.name}
          </h3>
          <button onClick={() => removeWidget(pref.type, pref.name)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✖ Sil</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '0.5rem 0.8rem' }}>Kategori</th>
                <th style={{ padding: '0.5rem 0.8rem', color: '#10b981' }}>Yapıldı</th>
                <th style={{ padding: '0.5rem 0.8rem', color: '#ef4444' }}>Yapılmadı</th>
                <th style={{ padding: '0.5rem 0.8rem', color: 'var(--text-muted)' }}>Gerek Yok (Boş)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '0.4rem 0.8rem', fontWeight: 500 }}>{row.category}</td>
                  <td style={{ padding: '0.4rem 0.8rem' }}>{row.yapildi}</td>
                  <td style={{ padding: '0.4rem 0.8rem' }}>{row.yapilmadi}</td>
                  <td style={{ padding: '0.4rem 0.8rem', color: 'var(--text-muted)' }}>{row.gerek_yok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Sort: OMs first, then Ilces
  const sortedPreferences = [...preferences].sort((a, b) => {
    if (a.type === 'om' && b.type === 'ilce') return -1;
    if (a.type === 'ilce' && b.type === 'om') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ padding: '0.5rem', maxWidth: '1200px' }}>
      <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>📊 Genel Özet Paneli</h1>
      
      {/* Yönetici Özeti (Sabit Widget) */}
      {tenderExtras && (
        <div style={{ marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', padding: '0.2rem 0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.8rem', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
              <span>🚨</span> İhale Kapsamına İlave İşler (Yönetici Özeti)
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Sadece Hatay Metropol, Kırıkhan ve Reyhanlı bölgesi için Excel ile eşleşmeyen ekstra iş kalemleri.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '120px', background: 'var(--surface-color)', padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.1rem' }}>Koridor Açma</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>{tenderExtras.extra_koridor_acma_km} Km</strong>
            </div>
            <div style={{ minWidth: '120px', background: 'var(--surface-color)', padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.1rem' }}>Ağaç Budama</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>{tenderExtras.extra_agac_budama_adet} Adet</strong>
            </div>
          </div>
        </div>
      )}

      {/* Dinamik Tablo Ekleme Formu */}
      <div style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', marginBottom: '1rem', display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, marginRight: '1rem' }}>➕ Analiz Tablosu Ekle:</h3>
        <select 
          value={selectedType} 
          onChange={(e) => {
            const newType = e.target.value;
            setSelectedType(newType);
            setSelectedValue(newType === 'om' ? availableOms[0] : availableIlces[0]);
          }}
          style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
        >
          <option value="om">Operasyon Merkezi</option>
          <option value="ilce">İlçe</option>
        </select>
        
        <select 
          value={selectedValue} 
          onChange={(e) => setSelectedValue(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', minWidth: '200px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
        >
          {(selectedType === 'om' ? availableOms : availableIlces).map(val => (
            <option key={val} value={val}>{val}</option>
          ))}
        </select>
        
        <button onClick={addWidget} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem' }}>Ekle</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Yükleniyor...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
          {sortedPreferences.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
              Henüz bir tablo eklemediniz. Yukarıdaki menüden Operasyon Merkezi veya İlçe seçerek ekleyebilirsiniz.
            </div>
          ) : (
            sortedPreferences.map(pref => (
              <div key={`${pref.type}_${pref.name}`}>
                {renderTable(pref)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
