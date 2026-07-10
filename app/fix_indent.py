import sys

def fix_main_py():
    with open("main.py", "r") as f:
        lines = f.readlines()
        
    new_lines = []
    
    for i, line in enumerate(lines):
        if i >= 84 and i <= 92:
            # Re-write the auth block using st.stop()
            if i == 84:
                new_lines.append("if 'logged_in_user' not in st.session_state:\n")
                new_lines.append("    login_form()\n")
                new_lines.append("    st.stop()\n\n")
                new_lines.append("logout_button()\n")
                new_lines.append("user_info = st.session_state.logged_in_user\n")
                new_lines.append("username = user_info['username']\n")
                new_lines.append("user_role = user_info['role']\n\n")
                new_lines.append('st.title(f"🌲 Ormanlık Alan Hat Bakım Takip Sistemi (Hoşgeldin, {username})")\n')
            continue
            
        if i >= 222:
            # We are at the # Tabs section. We need to un-indent these lines by 4 spaces.
            if line.startswith("    "):
                new_lines.append(line[4:])
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
            
    with open("main.py", "w") as f:
        f.writelines(new_lines)

if __name__ == "__main__":
    fix_main_py()
