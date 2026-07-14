/* Login screen — only ever shown once a company has opted into multi-user login
   from Settings -> Users & Access. Companies that never create a user account
   never see this at all. */

const LoginScreen = (() => {
  async function init(rootEl, onSuccess) {
    rootEl.innerHTML = `
      <div class="wizard-shell" style="max-width:400px;">
        <div style="text-align:center;margin-bottom:22px;">
          <div style="font-size:1.4rem;font-weight:700;color:var(--navy-900);">Log In</div>
          <div class="text-muted" style="font-size:0.88rem;">This company's ledger requires a login.</div>
        </div>
        <div class="wizard-card">
          <div class="field"><label>Username</label><input type="text" id="li-username" autofocus /></div>
          <div class="field" style="margin-top:12px;"><label>Password</label><input type="password" id="li-password" /></div>
          <div id="li-error" class="warn-text" style="display:none;margin-top:10px;"></div>
          <div class="wizard-nav" style="justify-content:flex-end;">
            <button class="btn" id="li-submit">Log In</button>
          </div>
        </div>
      </div>`;

    const submit = async () => {
      const username = document.getElementById("li-username").value.trim();
      const password = document.getElementById("li-password").value;
      const errorEl = document.getElementById("li-error");
      errorEl.style.display = "none";
      if (!username || !password) {
        errorEl.textContent = "Enter a username and password.";
        errorEl.style.display = "";
        return;
      }
      try {
        const res = await Api.login({ username, password });
        Auth.setSession(res.token, res.user);
        onSuccess();
      } catch (err) {
        errorEl.textContent = err.message || "Login failed.";
        errorEl.style.display = "";
      }
    };
    document.getElementById("li-submit").addEventListener("click", submit);
    document.getElementById("li-password").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }
  return { init };
})();
