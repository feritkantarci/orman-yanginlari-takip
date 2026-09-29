"use client";
import React, { useState, useEffect, useMemo } from "react";
import { fetchAPI } from "../lib/api";

interface NewLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  existingCities?: string[];
  linesData?: any[];
}

const TOROSLAR_CITIES = ["Adana", "Gaziantep", "Hatay", "Kilis", "Mersin", "Osmaniye"];

export default function NewLineModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  existingCities = [],
  linesData = []
}: NewLineModalProps) {
  
  // Clean cities list for dropdown
  const cityOptions = useMemo(() => {
    const fromProps = existingCities.filter(c => c && c !== "Tümü");
    const merged = Array.from(new Set([...fromProps, ...TOROSLAR_CITIES])).filter(Boolean).sort();
    return merged.length > 0 ? merged : TOROSLAR_CITIES;
  }, [existingCities]);

  const [form, setForm] = useState({
    dagitim_sirketi: "Toroslar EDAŞ",
    il: "Mersin",
    ilce: "",
    operasyon_merkezi: "",
    hat_ismi: "",
    gerilim_seviyesi: "OG",
    hat_uzunlugu: "",
    mevcut_risk: "1. Derece Riskli",
    siparis_no: "",
    planlanan_bakim: "",
    gerceklesen_bakim: ""
  });

  const [saving, setSaving] = useState(false);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialCity = cityOptions.includes("Mersin") ? "Mersin" : (cityOptions[0] || "Adana");
      setForm({
        dagitim_sirketi: "Toroslar EDAŞ",
        il: initialCity,
        ilce: "",
        operasyon_merkezi: "",
        hat_ismi: "",
        gerilim_seviyesi: "OG",
        hat_uzunlugu: "",
        mevcut_risk: "1. Derece Riskli",
        siparis_no: "",
        planlanan_bakim: "",
        gerceklesen_bakim: ""
      });
    }
  }, [isOpen, cityOptions]);

  // Derived suggestions for selected city
  const availableOMs = useMemo(() => {
    if (!linesData || linesData.length === 0) return [];
    return Array.from(new Set(
      linesData
        .filter((l: any) => l.il === form.il && l.operasyon_merkezi)
        .map((l: any) => l.operasyon_merkezi)
    )).sort() as string[];
  }, [linesData, form.il]);

  const availableDistricts = useMemo(() => {
    if (!linesData || linesData.length === 0) return [];
    return Array.from(new Set(
      linesData
        .filter((l: any) => l.il === form.il && l.ilce)
        .map((l: any) => l.ilce)
    )).sort() as string[];
  }, [linesData, form.il]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.il.trim() || !form.ilce.trim() || !form.operasyon_merkezi.trim() || !form.hat_ismi.trim()) {
      alert("Lütfen zorunlu alanları (İl, İlçe, Operasyon Merkezi, Hat İsmi) doldurunuz.");
      return;
    }

    setSaving(true);
    try {
      await fetchAPI('/lines', {
        method: 'POST',
        body: JSON.stringify({
          dagitim_sirketi: form.dagitim_sirketi.trim() || "Toroslar EDAŞ",
          il: form.il.trim(),
          ilce: form.ilce.trim(),
          operasyon_merkezi: form.operasyon_merkezi.trim(),
          hat_ismi: form.hat_ismi.trim(),
          gerilim_seviyesi: form.gerilim_seviyesi,
          hat_uzunlugu: form.hat_uzunlugu ? parseFloat(form.hat_uzunlugu) : 0,
          mevcut_risk: form.mevcut_risk,
          siparis_no: form.siparis_no.trim(),
          planlanan_bakim: form.planlanan_bakim ? new Date(form.planlanan_bakim).toISOString() : null,
          gerceklesen_bakim: form.gerceklesen_bakim ? new Date(form.gerceklesen_bakim).toISOString() : null
        })
      });

      alert("Yeni hat başarıyla eklendi.");
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      alert("Hat eklenirken hata oluştu: " + (err.message || "Bilinmeyen hata"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ 
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div className="glass-panel animate-fade-in modal-content" style={{ 
        width: '100%', maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--surface-color)', overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ➕ Yeni Hat Ekle (Ana Tabloya Satır Ekle)
          </h3>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:'1.5rem' }}>&times;</button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            
            {/* İl Combobox / Select */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                İl *
              </label>
              <select 
                value={form.il} 
                onChange={e => setForm({ ...form, il: e.target.value, ilce: '', operasyon_merkezi: '' })}
                required
                style={{ 
                  width: '100%', 
                  padding: '0.55rem 0.75rem', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border-color)', 
                  background: 'var(--surface-color)', 
                  color: 'white', 
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                {cityOptions.map(c => (
                  <option key={c} value={c} style={{ background: '#1e293b', color: 'white' }}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* İlçe */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                İlçe *
              </label>
              <input 
                type="text" 
                list="district-options"
                value={form.ilce} 
                onChange={e => setForm({ ...form, ilce: e.target.value })} 
                placeholder="Örn: Tarsus"
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem' }}
              />
              {availableDistricts.length > 0 && (
                <datalist id="district-options">
                  {availableDistricts.map(d => <option key={d} value={d} />)}
                </datalist>
              )}
            </div>

            {/* Operasyon Merkezi */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Operasyon Merkezi (OM) *
              </label>
              <input 
                type="text" 
                list="om-options"
                value={form.operasyon_merkezi} 
                onChange={e => setForm({ ...form, operasyon_merkezi: e.target.value })} 
                placeholder="Örn: Tarsus OM"
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem' }}
              />
              {availableOMs.length > 0 && (
                <datalist id="om-options">
                  {availableOMs.map(om => <option key={om} value={om} />)}
                </datalist>
              )}
            </div>
          </div>

          {/* Hat İsmi */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
              Hat İsmi *
            </label>
            <input 
              type="text" 
              value={form.hat_ismi} 
              onChange={e => setForm({ ...form, hat_ismi: e.target.value })} 
              placeholder="Örn: Çamlıyayla Kök Çıkış Hattı"
              required
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontWeight: 500, fontSize: '0.95rem' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Gerilim Seviyesi
              </label>
              <select 
                value={form.gerilim_seviyesi} 
                onChange={e => setForm({ ...form, gerilim_seviyesi: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem', cursor: 'pointer' }}
              >
                <option value="OG" style={{ background: '#1e293b' }}>OG (Orta Gerilim)</option>
                <option value="AG" style={{ background: '#1e293b' }}>AG (Alçak Gerilim)</option>
                <option value="AG/OG" style={{ background: '#1e293b' }}>AG/OG</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Hat Uzunluğu (Km)
              </label>
              <input 
                type="number" 
                step="0.01" 
                min="0"
                value={form.hat_uzunlugu} 
                onChange={e => setForm({ ...form, hat_uzunlugu: e.target.value })} 
                placeholder="Örn: 8.5"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Mevcut Risk Derecesi
              </label>
              <select 
                value={form.mevcut_risk} 
                onChange={e => setForm({ ...form, mevcut_risk: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem', cursor: 'pointer' }}
              >
                <option value="1. Derece Riskli" style={{ background: '#1e293b' }}>1. Derece Riskli</option>
                <option value="2. Derece Riskli" style={{ background: '#1e293b' }}>2. Derece Riskli</option>
                <option value="3. Derece Riskli" style={{ background: '#1e293b' }}>3. Derece Riskli</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Sipariş Numarası
              </label>
              <input 
                type="text" 
                value={form.siparis_no} 
                onChange={e => setForm({ ...form, siparis_no: e.target.value })} 
                placeholder="Örn: 4500012345"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Planlanan Bakım Tarihi
              </label>
              <input 
                type="date" 
                value={form.planlanan_bakim} 
                onChange={e => setForm({ ...form, planlanan_bakim: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Gerçekleşen Bakım Tarihi
              </label>
              <input 
                type="date" 
                value={form.gerceklesen_bakim} 
                onChange={e => setForm({ ...form, gerceklesen_bakim: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <button 
              type="button" 
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: '0.6rem 1.25rem' }}
            >
              İptal
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={saving}
              style={{ padding: '0.6rem 1.5rem', fontWeight: 'bold' }}
            >
              {saving ? 'Kaydediliyor...' : '💾 Hattı Kaydet ve Tabloya Ekle'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
