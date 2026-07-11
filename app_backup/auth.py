import streamlit as st
import sqlite3
import hashlib
import os

def get_db_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, 'database.db')

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def check_login(username, password):
    conn = sqlite3.connect(get_db_path())
    cursor = conn.cursor()
    cursor.execute("SELECT username, role, default_il, default_oms FROM users WHERE username = ? AND password_hash = ?", (username, hash_password(password)))
    user = cursor.fetchone()
    conn.close()
    
    if user:
        return {
            "username": user[0], 
            "role": user[1],
            "default_il": user[2],
            "default_oms": user[3]
        }
    return None

def login_form():
    print("--- LOGIN FORM REACHED ---", flush=True)
    st.markdown("<h1 style='text-align: center;'>🌲 Orman Yangınları<br>Takip Sistemi</h1>", unsafe_allow_html=True)
    st.markdown("<h3 style='text-align: center;'>Kullanıcı Girişi</h3>", unsafe_allow_html=True)
    
    with st.container():
        col1, col2, col3 = st.columns([1,2,1])
        with col2:
            with st.form("login_form"):
                st.write("Lütfen giriş yapınız")
                username = st.text_input("Kullanıcı Adı")
                password = st.text_input("Şifre", type="password")
                submit = st.form_submit_button("Giriş Yap")
                
                if submit:
                    if username and password:
                        user_info = check_login(username, password)
                        if user_info:
                            st.session_state.logged_in_user = user_info
                            st.success("Giriş başarılı! Yönlendiriliyorsunuz...")
                            st.rerun()
                        else:
                            st.error("Kullanıcı adı veya şifre hatalı!")
                    else:
                        st.error("Lütfen tüm alanları doldurunuz.")

def logout_button():
    if st.sidebar.button("🚪 Çıkış Yap"):
        if 'logged_in_user' in st.session_state:
            del st.session_state.logged_in_user
        st.rerun()
