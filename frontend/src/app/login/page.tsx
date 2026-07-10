"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../../lib/api"; // Will fetch directly with native fetch

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const { API_URL } = await import("../../lib/api");
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      if (!res.ok) {
        throw new Error("Geçersiz kullanıcı adı veya şifre!");
      }
      
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("username", data.username);
      localStorage.setItem("role", data.role);
      
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>🌲 Giriş Yap</h2>
        <p className="text-muted" style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Ormanlık Alan Hat Bakım Takip Sistemi
        </p>
        
        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger-color)', padding: '0.75rem', marginBottom: '1.5rem', borderRadius: '0 0.5rem 0.5rem 0' }}>
            <span className="text-danger" style={{ fontSize: '0.875rem' }}>{error}</span>
          </div>
        )}
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label>Kullanıcı Adı</label>
            <input 
              type="text" 
              placeholder="Örn: murat.k" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              required 
            />
          </div>
          
          <div style={{ marginBottom: '2rem' }}>
            <label>Şifre</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
