"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        window.location.href = "/dashboard";
      } else {
        window.location.href = "/login";
      }
    } catch (e) {
      window.location.href = "/login";
    }
  }, []);

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p className="text-muted">Yükleniyor...</p>
    </div>
  );
}
