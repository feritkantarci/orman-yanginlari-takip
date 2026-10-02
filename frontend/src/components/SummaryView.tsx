import React, { useState, useEffect } from 'react';
import { fetchAPI, fetchCustomStats, updateDashboardPreferences } from '../lib/api';

export default function SummaryView() {
  const [preferences, setPreferences] = useState<{type: string, name: string}[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
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
    const newData: Record<string, any> = {};
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
  
  const [cardQueryTypes, setCardQueryTypes] = useState<Record<string, 'ae' | 'asset'>>({});
  const [globalQueryType, setGlobalQueryType] = useState<'ae' | 'asset'>('ae');

  const setAllQueryTypes = (type: 'ae' | 'asset') => {
    setGlobalQueryType(type);
    const updated: Record<string, 'ae' | 'asset'> = {};
    preferences.forEach(p => {
      updated[`${p.type}_${p.name}`] = type;
    });
    setCardQueryTypes(updated);
  };
  
  const renderTable = (pref: {type: string, name: string}) => {
    const rawData = widgetData[`${pref.type}_${pref.name}`];
    if (!rawData) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Veriler yükleniyor...</div>;
    
    const queryType = cardQueryTypes[`${pref.type}_${pref.name}`] || globalQueryType;
    const categories = queryType === 'asset' 
      ? (rawData.asset_categories || rawData.categories || [])
      : (rawData.ae_categories || rawData.categories || []);

    const uninspectedLines = rawData?.uninspected_lines ?? 0;
    const totalLines = rawData?.total_lines ?? 0;
    const uninspectedAssets = rawData?.uninspected_assets ?? 0;
    const totalAssets = rawData?.total_assets ?? 0;
    
    return (
      <div style={{ background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Card Header */}
        <div style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1rem' }}>
              {pref.type === 'om' ? '🏢 OM: ' : '📍 İlçe: '} {pref.name}
            </h3>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
              {queryType === 'ae' ? `${totalLines} Anahtarlama Elemanı` : `${totalAssets.toLocaleString('tr-TR')} Asset ID`}
            </span>
          </div>
          <button onClick={() => removeWidget(pref.type, pref.name)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✖ Sil</button>
        </div>

        {/* Sorgu Tipi Selector Bar */}
        <div style={{ padding: '0.35rem 0.8rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Sorgu Tipi:</span>
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', padding: '2px' }}>
            <button
              onClick={() => setCardQueryTypes(prev => ({ ...prev, [`${pref.type}_${pref.name}`]: 'ae' }))}
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                fontWeight: queryType === 'ae' ? 600 : 400,
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: queryType === 'ae' ? '#10b981' : 'transparent',
                color: queryType === 'ae' ? '#ffffff' : 'var(--text-muted)'
              }}
            >
              ⚡ Anahtarlama Elemanı
            </button>
            <button
              onClick={() => setCardQueryTypes(prev => ({ ...prev, [`${pref.type}_${pref.name}`]: 'asset' }))}
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                fontWeight: queryType === 'asset' ? 600 : 400,
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: queryType === 'asset' ? '#3b82f6' : 'transparent',
                color: queryType === 'asset' ? '#ffffff' : 'var(--text-muted)'
              }}
            >
              📍 Asset ID (Varlık)
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '0.5rem 0.8rem' }}>Kategori</th>
                <th style={{ padding: '0.5rem 0.8rem', color: '#10b981' }}>Yapıldı</th>
                <th style={{ padding: '0.5rem 0.8rem', color: '#ef4444' }}>Yapılmadı</th>
                <th style={{ padding: '0.5rem 0.8rem', color: 'var(--accent-color)', textAlign: 'right' }}>Toplam Tespit</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row: any, i: number) => {
                const total = row.toplam_tespit ?? (row.yapildi + row.yapilmadi);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.45rem 0.8rem', fontWeight: 500 }}>{row.category}</td>
                    <td style={{ padding: '0.45rem 0.8rem', color: row.yapildi > 0 ? '#10b981' : 'inherit', fontWeight: row.yapildi > 0 ? 600 : 'normal' }}>{row.yapildi}</td>
                    <td style={{ padding: '0.45rem 0.8rem', color: row.yapilmadi > 0 ? '#ef4444' : 'inherit', fontWeight: row.yapilmadi > 0 ? 600 : 'normal' }}>{row.yapilmadi}</td>
                    <td style={{ padding: '0.45rem 0.8rem', fontWeight: 600, textAlign: 'right', color: total > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{total}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(239, 68, 68, 0.08)', borderTop: '2px solid rgba(239, 68, 68, 0.25)' }}>
                <td colSpan={2} style={{ padding: '0.6rem 0.8rem', fontWeight: 600, color: '#f87171' }}>
                  {queryType === 'ae' ? '🔴 Kontrol Edilmeyen Eleman:' : '🔴 Kontrol Bekleyen Asset ID:'}
                </td>
                <td colSpan={2} style={{ padding: '0.6rem 0.8rem', fontWeight: 700, textAlign: 'right', color: '#f87171', fontSize: '0.95rem' }}>
                  {queryType === 'ae' 
                    ? `${uninspectedLines.toLocaleString('tr-TR')} / ${totalLines.toLocaleString('tr-TR')}`
                    : `${uninspectedAssets.toLocaleString('tr-TR')} / ${totalAssets.toLocaleString('tr-TR')}`
                  }
                </td>
              </tr>
            </tfoot>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>📊 Genel Özet Paneli</h1>
        
        {/* Global Sorgu Tipi Seçici */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--surface-color)', padding: '0.35rem 0.7rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Genel Sorgu Tipi:</span>
          <div style={{ display: 'inline-flex', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px', border: '1px solid var(--glass-border)' }}>
            <button
              onClick={() => setAllQueryTypes('ae')}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: globalQueryType === 'ae' ? 600 : 400,
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                background: globalQueryType === 'ae' ? '#10b981' : 'transparent',
                color: globalQueryType === 'ae' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.2s ease'
              }}
            >
              ⚡ Anahtarlama Elemanı
            </button>
            <button
              onClick={() => setAllQueryTypes('asset')}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: globalQueryType === 'asset' ? 600 : 400,
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                background: globalQueryType === 'asset' ? '#3b82f6' : 'transparent',
                color: globalQueryType === 'asset' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.2s ease'
              }}
            >
              📍 Asset ID (Varlık)
            </button>
          </div>
        </div>
      </div>
      
      {/* Yönetici Özeti (Sabit Widget) */}
      {tenderExtras && (
        <div style={{ marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', padding: '0.4rem 0.8rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem' }}>
              <span>🚨</span> İhale Kapsamına İlave İşler (Yönetici Özeti)
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Sözleşme keşfinde yer almayıp sahada tespit yapılan Anahtarlama Elemanı sayıları (Hatay Metropol, Kırıkhan, Reyhanlı).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '140px', background: 'var(--surface-color)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.1rem' }}>Koridor Açma</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                {tenderExtras.extra_koridor_acma_ae ?? tenderExtras.extra_koridor_acma_km ?? 0} Anahtarlama Elemanı
              </strong>
            </div>
            <div style={{ minWidth: '140px', background: 'var(--surface-color)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.1rem' }}>Ağaç Budama</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                {tenderExtras.extra_agac_budama_ae ?? tenderExtras.extra_agac_budama_adet ?? 0} Anahtarlama Elemanı
              </strong>
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
