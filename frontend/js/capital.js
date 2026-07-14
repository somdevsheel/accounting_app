/* Capital Accounts (partner/shareholder equity) + Capital Contribution Log (derived from Journal). */

const CapitalAccountsView = (() => {
  async function render(container) {
    const data = await Api.capitalAccounts();
    if (data.rows.length === 0) {
      container.innerHTML = emptyState("🤝", "No owners yet", "Add owners or partners from Settings → Owners / Partners.");
      return;
    }
    container.innerHTML = `
      <div class="toolbar"><h2 style="margin:0;font-size:1.05rem;">${escapeHtml(data.label)}</h2><button class="btn" id="ca-record">+ Record Contribution</button></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th class="num">Share %</th><th class="num">Capital Introduced</th><th class="num">Drawings</th><th class="num">Profit Allocation</th><th class="num">Ledger Balance</th><th class="num">Closing Balance (incl. profit)</th></tr></thead>
          <tbody>
            ${data.rows.map((r) => `
              <tr>
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.role || "")}</td>
                <td class="num">${r.share_percent.toFixed(2)}%</td>
                <td class="num">${fmtMoney(r.capital_introduced)}</td>
                <td class="num">${fmtMoney(r.drawings)}</td>
                <td class="num">${fmtMoney(r.profit_allocation)}</td>
                <td class="num">${fmtMoney(r.ledger_balance)}</td>
                <td class="num"><strong>${fmtMoney(r.closing_balance_with_profit)}</strong></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="text-muted" style="font-size:0.8rem;margin-top:10px;">Company net profit to date: <strong>${fmtMoney(data.company_net_profit)}</strong>. Profit allocation is a memo figure (net profit × share %) — post a journal entry to actually transfer it into a capital account.</p>`;
    document.getElementById("ca-record").addEventListener("click", () => openContributionModal(container));
  }

  function openContributionModal(container) {
    const owners = State.owners.filter((o) => o.is_active && o.capital_account_id);
    const depositAccounts = State.activeAccounts().filter((a) => a.name === "Cash" || a.name === "Bank");
    const html = `
      <div class="modal-header"><h2>Record Capital Contribution</h2><button class="modal-close" id="m-close">✕</button></div>
      <p class="text-muted" style="font-size:0.82rem;margin-top:-6px;">Posts a Journal Entry: debits the account below, credits the owner's Capital account. Shows up here and everywhere else instantly.</p>
      <div class="form-grid">
        <div class="field"><label>Owner</label>
          <select id="rc-owner">${owners.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Deposited To</label>
          <select id="rc-deposit">${depositAccounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Date</label><input type="date" id="rc-date" value="${todayStr()}" /></div>
        <div class="field"><label>Amount</label><input type="number" step="0.01" id="rc-amount" placeholder="0.00" /></div>
        <div class="field" style="grid-column:1/-1;"><label>Narration</label><input type="text" id="rc-narration" placeholder="Capital contribution" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="rc-save">Post Entry</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("rc-save").addEventListener("click", async () => {
      const ownerId = Number(document.getElementById("rc-owner").value);
      const owner = owners.find((o) => o.id === ownerId);
      const depositAccountId = Number(document.getElementById("rc-deposit").value);
      const amount = Number(document.getElementById("rc-amount").value);
      const date = document.getElementById("rc-date").value;
      const narration = document.getElementById("rc-narration").value || "Capital contribution";
      if (!owner || !depositAccountId) { toast("Choose an owner and an account", true); return; }
      if (!amount || amount <= 0) { toast("Enter an amount greater than 0", true); return; }
      if (!date) { toast("Date is required", true); return; }
      try {
        await Api.createJournalEntry({
          date,
          voucher_type: "Receipt",
          party_name: owner.name,
          payment_mode: null,
          payment_status: "Paid",
          narration,
          lines: [
            { account_id: depositAccountId, debit_amount: amount, credit_amount: 0 },
            { account_id: owner.capital_account_id, debit_amount: 0, credit_amount: amount },
          ],
        });
        toast("Contribution posted");
        App.closeModal();
        render(container);
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  return { render };
})();

const CapitalContributionsView = (() => {
  async function render(container) {
    const data = await Api.capitalContributions();
    if (data.rows.length === 0) {
      container.innerHTML = emptyState("💰", "No capital contributions yet", "Every credit posted to an owner's Capital account shows up here automatically — post a Receipt journal entry to log one.");
      return;
    }
    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Voucher No.</th><th>Owner</th><th>Narration</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${data.rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${r.voucher_no}</td><td>${escapeHtml(r.owner_name || "—")}</td><td>${escapeHtml(r.narration || "")}</td><td class="num">${fmtMoney(r.amount)}</td></tr>`).join("")}
          </tbody>
          <tfoot><tr><td colspan="4">Total</td><td class="num">${fmtMoney(data.total)}</td></tr></tfoot>
        </table>
      </div>`;
  }
  return { render };
})();
